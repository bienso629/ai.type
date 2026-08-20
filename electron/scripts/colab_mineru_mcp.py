# ==============================================================================
# Google Colab GPU Worker Server for MinerU & Cumulative FAISS Builder (ai.type)
# ==============================================================================

import base64
import os
import sys
import json
import subprocess
import time
import re
import threading
from fastapi import FastAPI, Request
from fastapi.responses import JSONResponse
from fastapi.middleware.cors import CORSMiddleware
import uvicorn

# 1. Tai cloudflared neu chua co
try:
    if subprocess.run("which cloudflared", shell=True, capture_output=True).returncode != 0:
        print("[Colab Setup] Dang tai Cloudflare Tunnel binary...")
        subprocess.run("curl -fsSL https://github.com/cloudflare/cloudflared/releases/latest/download/cloudflared-linux-amd64 -o /usr/local/bin/cloudflared && chmod +x /usr/local/bin/cloudflared", shell=True)
except Exception as e:
    print(f"[Colab Setup] Canh bao cloudflared: {e}")

# 2. Cai dat cac thu vien can thiet
for pkg, pip_name in [("fitz", "pymupdf"), ("pypdf", "pypdf"), ("faiss", "faiss-gpu"), ("sentence_transformers", "sentence-transformers")]:
    try:
        __import__(pkg)
    except ImportError:
        print(f"[Colab Setup] Dang cai dat {pip_name}...")
        try:
            subprocess.run([sys.executable, "-m", "pip", "install", "-q", pip_name], check=True)
        except Exception as pe:
            print(f"[Colab Setup] Loi cai dat {pip_name}: {pe}")

# 3. Khoi tao FastAPI App
app = FastAPI(title="MinerU & FAISS Colab GPU Server")
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

@app.get("/")
@app.get("/status")
def status():
    return {
        "status": "online",
        "gpu": get_device_info(),
        "tools": [
            {"name": "build_faiss_from_pdf", "description": "Phan tich PDF va tich luy FAISS Vector Index"},
            {"name": "mineru_parse_pdf", "description": "Phan tich PDF bang MinerU GPU"},
            {"name": "check_gpu_status", "description": "Kiem tra GPU Colab"}
        ]
    }

@app.get("/tools")
def get_tools():
    return {
        "tools": [
            {"name": "build_faiss_from_pdf", "description": "Phan tich PDF va tich luy FAISS Vector Index"},
            {"name": "mineru_parse_pdf", "description": "Phan tich PDF bang MinerU GPU"},
            {"name": "check_gpu_status", "description": "Kiem tra GPU Colab"}
        ]
    }

@app.post("/call_tool")
@app.post("/tools/call")
async def call_tool(request: Request):
    body = await request.json()
    tool_name = body.get("name") or body.get("tool")
    args = body.get("arguments") or body.get("args") or body
    
    if tool_name == "check_gpu_status":
        return {"gpu": get_device_info(), "status": "online"}
        
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

# 4. Khoi dong Web Server
def run_app():
    uvicorn.run(app, host="0.0.0.0", port=8000, log_level="warning")

threading.Thread(target=run_app, daemon=True).start()
time.sleep(2)

# 5. Tao Cloudflare Tunnel
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
                print("COLAB GPU & FAISS SERVER DA SAN SANG!")
                print(f"AITYPE_COLAB_URL: {url}")
                print("="*65 + "\n")
                break