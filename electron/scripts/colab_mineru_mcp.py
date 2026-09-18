# ==============================================================================
# Google Colab GPU Worker Server for MinerU, FAISS & OmniVoice TTS (ai.type)
# ==============================================================================

import base64
import os
import sys
import json
import subprocess
import time
import re
import threading
from typing import Optional, Dict, Any

from fastapi import FastAPI, Request, HTTPException
from fastapi.responses import JSONResponse, FileResponse
from fastapi.middleware.cors import CORSMiddleware
from pydantic import BaseModel
import uvicorn

# 1. Tai cloudflared neu chua co
try:
    if subprocess.run("which cloudflared", shell=True, capture_output=True).returncode != 0:
        print("[Colab Setup] Dang tai Cloudflare Tunnel binary...")
        subprocess.run("curl -fsSL https://github.com/cloudflare/cloudflared/releases/latest/download/cloudflared-linux-amd64 -o /usr/local/bin/cloudflared && chmod +x /usr/local/bin/cloudflared", shell=True)
except Exception as e:
    print(f"[Colab Setup] Canh bao cloudflared: {e}")

# 2. Cai dat cac thu vien can thiet
for pkg, pip_name in [
    ("fitz", "pymupdf"),
    ("pypdf", "pypdf"),
    ("faiss", "faiss-gpu"),
    ("sentence_transformers", "sentence-transformers"),
    ("soundfile", "soundfile"),
    ("torchaudio", "torchaudio")
]:
    try:
        __import__(pkg)
    except ImportError:
        print(f"[Colab Setup] Dang cai dat {pip_name}...")
        try:
            subprocess.run([sys.executable, "-m", "pip", "install", "-q", pip_name], check=True)
        except Exception as pe:
            print(f"[Colab Setup] Loi cai dat {pip_name}: {pe}")

# Cai dat omnivoice
try:
    __import__("omnivoice")
except ImportError:
    print("[Colab Setup] Dang cai dat omnivoice...")
    try:
        subprocess.run([sys.executable, "-m", "pip", "install", "-q", "omnivoice"], check=True)
    except Exception:
        try:
            subprocess.run([sys.executable, "-m", "pip", "install", "-q", "git+https://github.com/k2-fsa/OmniVoice.git"], check=True)
        except Exception as oe:
            print(f"[Colab Setup] Canh bao cai dat omnivoice: {oe}")

# 3. Thu muc lam viec cho OmniVoice TTS
VOICES_DIR = "/content/voices"
OUTPUT_DIR = "/content/tts_output"
os.makedirs(VOICES_DIR, exist_ok=True)
os.makedirs(OUTPUT_DIR, exist_ok=True)

# 4. Khoi tao FastAPI App
app = FastAPI(title="MinerU, FAISS & OmniVoice Colab GPU Server")
app.add_middleware(
    CORSMiddleware,
    allow_origins=["*"],
    allow_credentials=True,
    allow_methods=["*"],
    allow_headers=["*"],
)

def get_device_info():
    try:
        gpu = subprocess.getoutput("nvidia-smi --query-gpu=name,memory.total,memory.used --format=csv,noheader")
        if "command not found" not in gpu and gpu.strip():
            return gpu.strip()
    except Exception:
        pass
    return "CPU Mode"

omnivoice_model = None
omnivoice_lock = threading.Lock()
tasks_db: Dict[str, Dict[str, Any]] = {}

def get_omnivoice_model():
    global omnivoice_model
    with omnivoice_lock:
        if omnivoice_model is None:
            import torch
            from omnivoice import OmniVoice
            device = "cuda:0" if torch.cuda.is_available() else "cpu"
            dtype = torch.float16 if torch.cuda.is_available() else torch.float32
            print(f"[OmniVoice] Dang nap model tren {device} ({dtype})...")
            omnivoice_model = OmniVoice.from_pretrained("k2-fsa/OmniVoice", device_map=device, dtype=dtype)
            print("[OmniVoice] Da nap xong OmniVoice!")
        return omnivoice_model

class AudioAsyncRequest(BaseModel):
    text: str
    ref_audio_name: Optional[str] = "yenai.wav"
    ref_text: Optional[str] = ""
    speed: Optional[float] = 1.0
    num_step: Optional[int] = 16
    ref_audio_base64: Optional[str] = None

@app.get("/")
@app.get("/status")
def status():
    return {
        "status": "online",
        "gpu": get_device_info(),
        "omnivoice_loaded": omnivoice_model is not None,
        "tools": [
            {"name": "build_faiss_from_pdf", "description": "Phan tich PDF va tich luy FAISS Vector Index"},
            {"name": "mineru_parse_pdf", "description": "Phan tich PDF bang MinerU GPU"},
            {"name": "check_gpu_status", "description": "Kiem tra GPU Colab"},
            {"name": "omnivoice_tts", "description": "Tao giong doc AI OmniVoice GPU"}
        ]
    }

@app.get("/tools")
def get_tools():
    return {
        "tools": [
            {"name": "build_faiss_from_pdf", "description": "Phan tich PDF va tich luy FAISS Vector Index"},
            {"name": "mineru_parse_pdf", "description": "Phan tich PDF bang MinerU GPU"},
            {"name": "check_gpu_status", "description": "Kiem tra GPU Colab"},
            {"name": "omnivoice_tts", "description": "Tao giong doc AI OmniVoice GPU"}
        ]
    }

@app.get("/status/{task_id}")
def get_task_status(task_id: str):
    if task_id not in tasks_db:
        return {"status": "error", "message": "Task khong ton tai"}
    return tasks_db[task_id]

@app.get("/download/{filename}")
def download_file(filename: str):
    file_path = os.path.join(OUTPUT_DIR, filename)
    if not os.path.exists(file_path):
        raise HTTPException(status_code=404, detail="File khong ton tai")
    return FileResponse(file_path, media_type="audio/wav", filename=filename)

@app.get("/download_audio/{task_id}")
def download_audio(task_id: str):
    file_path = os.path.join(OUTPUT_DIR, f"{task_id}.wav")
    if not os.path.exists(file_path):
        raise HTTPException(status_code=404, detail="File am thanh khong ton tai")
    return FileResponse(file_path, media_type="audio/wav", filename=f"{task_id}.wav")

@app.post("/cancel_task/{task_id}")
def cancel_task(task_id: str):
    if task_id in tasks_db:
        tasks_db[task_id]["status"] = "cancelled"
    return {"success": True}

def run_omnivoice_task(task_id: str, req: AudioAsyncRequest):
    try:
        import torch
        import soundfile as sf
        import numpy as np

        tasks_db[task_id] = {"status": "processing", "progress": 20}
        model = get_omnivoice_model()

        ref_audio_path = None
        if req.ref_audio_base64:
            ref_audio_path = os.path.join(VOICES_DIR, f"{task_id}_ref.wav")
            with open(ref_audio_path, "wb") as f:
                f.write(base64.b64decode(req.ref_audio_base64))
        else:
            target_name = req.ref_audio_name or "yenai.wav"
            candidates = [
                os.path.join(VOICES_DIR, target_name),
                os.path.join(VOICES_DIR, target_name.lower()),
                os.path.join(VOICES_DIR, f"{target_name}.wav"),
                os.path.join(VOICES_DIR, "yenai.wav"),
                os.path.join(VOICES_DIR, "mpsg.wav")
            ]
            for c in candidates:
                if os.path.exists(c):
                    ref_audio_path = c
                    break

        if tasks_db.get(task_id, {}).get("status") == "cancelled":
            return

        raw_text = req.text.strip()
        sentences = [s.strip() for s in re.split(r"[.?!]+\s+|\n+", raw_text) if s.strip()]
        if not sentences:
            sentences = [raw_text]

        tasks_db[task_id]["progress"] = 40
        audio_chunks = []
        with torch.inference_mode():
            for i, sentence in enumerate(sentences):
                if tasks_db.get(task_id, {}).get("status") == "cancelled":
                    return
                gen_kwargs = {
                    "text": sentence,
                    "num_step": req.num_step or 16,
                    "speed": req.speed or 1.0
                }
                if ref_audio_path and os.path.exists(ref_audio_path):
                    gen_kwargs["ref_audio"] = ref_audio_path
                    ref_text_to_use = req.ref_text.strip() if req.ref_text else ""
                    if not ref_text_to_use:
                        default_texts = {
                            "yenai": "Đêm giao thừa, cả nhà không ai lo cắm mặt vào điện thoại, chúng tôi ngồi bên nhau, kể chuyện, cười đùa, chờ đợi tiếng pháo nổ giòn giã ngoài ngõ.",
                            "mpsg": "Rachel đã ly dị, đã mất việc, đã chìm trong rượu và cay đắng, chẳng còn nơi nào để đến và đi."
                        }
                        for k, v in default_texts.items():
                            if k in os.path.basename(ref_audio_path).lower():
                                ref_text_to_use = v
                                break
                    if ref_text_to_use:
                        gen_kwargs["ref_text"] = ref_text_to_use

                out_chunk = model.generate(**gen_kwargs)
                if isinstance(out_chunk, (list, tuple)):
                    out_chunk = out_chunk[0]
                if isinstance(out_chunk, torch.Tensor):
                    out_chunk = out_chunk.cpu().numpy()
                audio_chunks.append(out_chunk)

        if not audio_chunks:
            raise ValueError("Khong co du lieu am thanh nao duoc tao ra.")

        if len(audio_chunks) > 1:
            final_audio = np.concatenate(audio_chunks, axis=-1)
        else:
            final_audio = audio_chunks[0]

        out_filename = f"{task_id}.wav"
        out_filepath = os.path.join(OUTPUT_DIR, out_filename)
        sf.write(out_filepath, final_audio, 24000)

        tasks_db[task_id] = {
            "status": "done",
            "download_url": f"/download/{out_filename}",
            "task_id": task_id,
            "progress": 100
        }
    except Exception as e:
        import traceback
        traceback.print_exc()
        tasks_db[task_id] = {"status": "error", "message": str(e)}

@app.post("/generate_audio_async")
def generate_audio_async(req: AudioAsyncRequest):
    task_id = f"tts_{int(time.time()*1000)}_{os.urandom(3).hex()}"
    tasks_db[task_id] = {"status": "pending", "progress": 0}
    threading.Thread(target=run_omnivoice_task, args=(task_id, req), daemon=True).start()
    return {"task_id": task_id, "status": "started"}

@app.post("/call_tool")
@app.post("/tools/call")
async def call_tool(request: Request):
    body = await request.json()
    tool_name = body.get("name") or body.get("tool")
    args = body.get("arguments") or body.get("args") or body
    
    if tool_name == "check_gpu_status":
        return {"gpu": get_device_info(), "status": "online"}
        
    elif tool_name == "omnivoice_tts":
        text = args.get("text", "")
        voice_name = args.get("voice", "yenai")
        ref_audio_b64 = args.get("ref_audio_base64", None)
        ref_text = args.get("ref_text", "")
        speed = float(args.get("speed", 1.0))
        num_step = int(args.get("num_step", 16))
        req_obj = AudioAsyncRequest(
            text=text,
            ref_audio_name=f"{voice_name}.wav",
            ref_audio_base64=ref_audio_b64,
            ref_text=ref_text,
            speed=speed,
            num_step=num_step
        )
        task_id = f"tool_{int(time.time()*1000)}_{os.urandom(3).hex()}"
        run_omnivoice_task(task_id, req_obj)
        result = tasks_db.get(task_id, {})
        if result.get("status") == "done":
            wav_path = os.path.join(OUTPUT_DIR, f"{task_id}.wav")
            with open(wav_path, "rb") as f:
                wav_b64 = base64.b64encode(f.read()).decode("ascii")
            return {"status": "success", "audio_base64": wav_b64, "download_url": result.get("download_url")}
        return {"status": "error", "error": result.get("message", "Xu ly that bai")}

    elif tool_name == "execute_code":
        code = args.get("code", "")
        language = args.get("language", "python")
        try:
            if language in ["bash", "sh"]:
                res = subprocess.run(code, shell=True, capture_output=True, text=True, timeout=120)
                return {"stdout": res.stdout, "stderr": res.stderr, "returncode": res.returncode}
            else:
                import io
                old_stdout = sys.stdout
                old_stderr = sys.stderr
                redirected_output = sys.stdout = io.StringIO()
                redirected_error = sys.stderr = io.StringIO()
                exec_globals = {}
                try:
                    exec(code, exec_globals)
                finally:
                    sys.stdout = old_stdout
                    sys.stderr = old_stderr
                return {"stdout": redirected_output.getvalue(), "stderr": redirected_error.getvalue(), "success": True}
        except Exception as e:
            return {"error": str(e), "success": False}

    elif tool_name in ["mineru_parse_pdf", "build_faiss_from_pdf"]:
        pdf_base64 = args.get("pdf_base64", "")
        filename = args.get("filename", "document.pdf")
        doc_type = args.get("doc_type", "qa_detailed")
        google_api_key = args.get("google_api_key", "")
        existing_faiss_b64 = args.get("existing_faiss_base64", "")
        existing_pkl_b64 = args.get("existing_pkl_base64", "")
        
        work_dir = "/tmp/mineru_work"
        os.makedirs(work_dir, exist_ok=True)
        pdf_path = os.path.join(work_dir, filename)
        with open(pdf_path, "wb") as f:
            f.write(base64.b64decode(pdf_base64))
            
        output_dir = os.path.join(work_dir, "output")
        os.makedirs(output_dir, exist_ok=True)
        
        markdown_content = ""
        # 1. Thu boc tach voi MinerU neu co
        try:
            cmd = f"magic-pdf -p '{pdf_path}' -o '{output_dir}' -m auto"
            subprocess.run(cmd, shell=True, capture_output=True, text=True, timeout=180)
            base_name = os.path.splitext(filename)[0]
            result_md_path = os.path.join(output_dir, base_name, "auto", f"{base_name}.md")
            if os.path.exists(result_md_path):
                with open(result_md_path, "r", encoding="utf-8") as f:
                    markdown_content = f.read()
        except Exception as e:
            print(f"[MinerU] Exception: {e}")
            
        # Fallback bang PyMuPDF hoac PyPDF
        if not markdown_content or len(markdown_content.strip()) < 30:
            try:
                import fitz
                doc = fitz.open(pdf_path)
                pages_text = []
                for idx, page in enumerate(doc):
                    t = page.get_text("text")
                    if t and t.strip():
                        pages_text.append(f"## Trang {idx + 1}\n{t.strip()}")
                if pages_text:
                    markdown_content = "\n\n".join(pages_text)
                    print(f"[PyMuPDF] Trich xuat {len(pages_text)} trang ({len(markdown_content)} ky tu) tu {filename}")
            except Exception as fe:
                print(f"[PyMuPDF] Fallback error: {fe}")
                try:
                    from pypdf import PdfReader
                    reader = PdfReader(pdf_path)
                    pages_text = []
                    for idx, page in enumerate(reader.pages):
                        t = page.extract_text()
                        if t and t.strip():
                            pages_text.append(f"## Trang {idx + 1}\n{t.strip()}")
                    if pages_text:
                        markdown_content = "\n\n".join(pages_text)
                except Exception as pe:
                    print(f"[PyPDF] Fallback error: {pe}")

        if not markdown_content or len(markdown_content.strip()) < 10:
            markdown_content = f"Tai lieu {filename} (Khong co noi dung van ban)"

        # 2. Chia nho van ban thanh Chunks (~800 ky tu)
        new_chunk_texts = []
        new_chunk_metas = []
        paras = [p.strip() for p in markdown_content.split("\n\n") if p.strip()]
        curr = ""
        for p in paras:
            if len(curr) + len(p) < 800:
                curr += ("\n\n" + p) if curr else p
            else:
                if curr:
                    new_chunk_texts.append(curr)
                    new_chunk_metas.append({"source": filename, "doc_type": doc_type, "chunk_id": len(new_chunk_texts)})
                curr = p
        if curr:
            new_chunk_texts.append(curr)
            new_chunk_metas.append({"source": filename, "doc_type": doc_type, "chunk_id": len(new_chunk_texts)})
            
        print(f"[FAISS] So doan moi cua {filename}: {len(new_chunk_texts)}")

        # 3. Nap chi muc FAISS cu neu co de tich luy
        faiss_b64 = None
        pkl_b64 = None
        total_chunks = len(new_chunk_texts)
        
        try:
            import faiss
            import numpy as np
            import pickle
            from sentence_transformers import SentenceTransformer
            
            print("[FAISS] Dang tinh Vector Embeddings...")
            embed_model = SentenceTransformer("all-MiniLM-L6-v2")
            new_vectors = embed_model.encode(new_chunk_texts, batch_size=64, show_progress_bar=False, normalize_embeddings=True)
            dimension = new_vectors.shape[1] # 384
            
            existing_texts = []
            existing_metas = []
            index = None
            
            if existing_faiss_b64 and existing_pkl_b64:
                try:
                    old_faiss_file = os.path.join(work_dir, "old_index.faiss")
                    old_pkl_file = os.path.join(work_dir, "old_index.pkl")
                    with open(old_faiss_file, "wb") as f:
                        f.write(base64.b64decode(existing_faiss_b64))
                    with open(old_pkl_file, "wb") as f:
                        f.write(base64.b64decode(existing_pkl_b64))
                    
                    old_index = faiss.read_index(old_faiss_file)
                    with open(old_pkl_file, "rb") as f:
                        old_data = pickle.load(f)
                        existing_texts = old_data.get("texts", [])
                        existing_metas = old_data.get("metadatas", [])
                    
                    if old_index.d == dimension:
                        index = old_index
                        print(f"[FAISS] Nap thanh cong {len(existing_texts)} doan cu ({old_index.ntotal} vectors).")
                except Exception as oe:
                    print(f"[FAISS] Canh bao nap cu ({oe}), tao moi.")
                    index = None
            
            if index is None:
                index = faiss.IndexFlatIP(dimension)
                existing_texts = []
                existing_metas = []
                
            index.add(new_vectors.astype(np.float32))
            all_texts = existing_texts + new_chunk_texts
            all_metas = existing_metas + new_chunk_metas
            total_chunks = len(all_texts)
            
            faiss_file = os.path.join(work_dir, "index.faiss")
            pkl_file = os.path.join(work_dir, "index.pkl")
            
            faiss.write_index(index, faiss_file)
            with open(pkl_file, "wb") as f:
                pickle.dump({"texts": all_texts, "metadatas": all_metas, "dimension": dimension}, f)
                
            with open(faiss_file, "rb") as f:
                faiss_b64 = base64.b64encode(f.read()).decode("utf-8")
            with open(pkl_file, "rb") as f:
                pkl_b64 = base64.b64encode(f.read()).decode("utf-8")
                
            faiss_size = os.path.getsize(faiss_file)
            pkl_size = os.path.getsize(pkl_file)
            print(f"[FAISS] Tich luy thanh cong! Tong: {total_chunks} chunks ({index.ntotal} vectors). index.faiss: {faiss_size} bytes")
        except Exception as fe:
            print(f"[FAISS] Build error: {fe}")
            
        return {
            "success": True,
            "filename": filename,
            "doc_type": doc_type,
            "markdown": markdown_content,
            "new_chunks_count": len(new_chunk_texts),
            "chunks_count": total_chunks,
            "faiss_base64": faiss_b64,
            "pkl_base64": pkl_b64
        }
        
    return {"error": f"Unknown tool: {tool_name}"}

# 5. Khoi dong Web Server
def run_app():
    uvicorn.run(app, host="0.0.0.0", port=8000, log_level="warning")

threading.Thread(target=run_app, daemon=True).start()
time.sleep(2)

# 6. Tao Cloudflare Tunnel
print("\n" + "="*65)
print("DANG TAO DUONG HAM CHO ELECTRON APP...")
print("="*65)

subprocess.run("pkill -9 cloudflared", shell=True)
if os.path.exists("/tmp/cf.log"):
    os.remove("/tmp/cf.log")

subprocess.Popen("cloudflared tunnel --url http://localhost:8000 > /tmp/cf.log 2>&1 &", shell=True)

for i in range(25):
    time.sleep(1)
    if os.path.exists("/tmp/cf.log"):
        with open("/tmp/cf.log", "r") as f:
            content = f.read()
            match = re.search(r"https://[a-zA-Z0-9-]+.trycloudflare.com", content)
            if match:
                url = match.group(0)
                print("\n" + "="*65)
                print("COLAB GPU, FAISS & OMNIVOICE SERVER DA SAN SANG!")
                print(f"AITYPE_COLAB_URL: {url}")
                print("="*65 + "\n")
                break
