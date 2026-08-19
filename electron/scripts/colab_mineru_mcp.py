# ==============================================================================
# Google Colab GPU Worker Server for MinerU & Direct FAISS Builder (ai.type)
# ==============================================================================

import base64
import os
import json
import subprocess
import time
import re
import threading
from fastapi import FastAPI, Request
from fastapi.responses import JSONResponse
from fastapi.middleware.cors import CORSMiddleware
import uvicorn

# 1. Khởi tạo FastAPI App
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
            {"name": "build_faiss_from_pdf", "description": "Phân tích PDF bằng MinerU & tạo FAISS Vector Index"},
            {"name": "mineru_parse_pdf", "description": "Phân tích PDF bằng MinerU GPU"},
            {"name": "check_gpu_status", "description": "Kiểm tra GPU Colab"}
        ]
    }

@app.get("/tools")
def get_tools():
    return {
        "tools": [
            {"name": "build_faiss_from_pdf", "description": "Phân tích PDF bằng MinerU & tạo FAISS Vector Index"},
            {"name": "mineru_parse_pdf", "description": "Phân tích PDF bằng MinerU GPU"},
            {"name": "check_gpu_status", "description": "Kiểm tra GPU Colab"}
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
        
    elif tool_name in ["mineru_parse_pdf", "build_faiss_from_pdf"]:
        pdf_base64 = args.get("pdf_base64", "")
        filename = args.get("filename", "document.pdf")
        doc_type = args.get("doc_type", "qa_detailed")
        google_api_key = args.get("google_api_key", "")
        
        work_dir = "/tmp/mineru_work"
        os.makedirs(work_dir, exist_ok=True)
        pdf_path = os.path.join(work_dir, filename)
        with open(pdf_path, "wb") as f:
            f.write(base64.b64decode(pdf_base64))
            
        output_dir = os.path.join(work_dir, "output")
        os.makedirs(output_dir, exist_ok=True)
        
        markdown_content = ""
        # 1. Thử bóc tách với MinerU (Magic-PDF)
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
            
        # Fallback siêu tốc bằng PyMuPDF (fitz) hoặc PyPDF
        if not markdown_content or len(markdown_content.strip()) < 30:
            try:
                import fitz
                doc = fitz.open(pdf_path)
                pages_text = []
                for idx, page in enumerate(doc):
                    t = page.get_text("text")
                    if t and t.strip():
                        pages_text.append(f"## Trang {idx + 1}\n{t.strip()}")
                markdown_content = "\n\n".join(pages_text)
                print(f"[PyMuPDF] Đã trích xuất {len(pages_text)} trang ({len(markdown_content)} ký tự)")
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
                    markdown_content = "\n\n".join(pages_text)
                except Exception as pe:
                    print(f"[PyPDF] Fallback error: {pe}")

        if not markdown_content:
            markdown_content = f"Tài liệu {filename} (Không có nội dung văn bản)"

        # 2. Chia nhỏ văn bản thành các Chunks (~800 ký tự)
        chunk_texts = []
        chunk_metas = []
        paras = [p.strip() for p in markdown_content.split("\n\n") if p.strip()]
        curr = ""
        for p in paras:
            if len(curr) + len(p) < 800:
                curr += "\n\n" + p if curr else p
            else:
                if curr:
                    chunk_texts.append(curr)
                    chunk_metas.append({"source": filename, "doc_type": doc_type, "chunk_id": len(chunk_texts)})
                curr = p
        if curr:
            chunk_texts.append(curr)
            chunk_metas.append({"source": filename, "doc_type": doc_type, "chunk_id": len(chunk_texts)})
            
        chunks_count = len(chunk_texts)
        print(f"[FAISS] Tổng số đoạn text chunking: {chunks_count}")

        # 3. Tạo FAISS Vector Database trực tiếp với SentenceTransformer & Faiss
        faiss_b64 = None
        pkl_b64 = None
        
        try:
            import faiss
            import numpy as np
            import pickle
            from sentence_transformers import SentenceTransformer
            
            print("[FAISS] Đang tính toán Vector Embeddings trên GPU...")
            embed_model = SentenceTransformer('all-MiniLM-L6-v2')
            vectors = embed_model.encode(chunk_texts, batch_size=64, show_progress_bar=False, normalize_embeddings=True)
            
            dimension = vectors.shape[1] # 384
            index = faiss.IndexFlatIP(dimension) # Cosine similarity
            index.add(vectors.astype(np.float32))
            
            faiss_file = os.path.join(work_dir, "index.faiss")
            pkl_file = os.path.join(work_dir, "index.pkl")
            
            faiss.write_index(index, faiss_file)
            with open(pkl_file, "wb") as f:
                pickle.dump({"texts": chunk_texts, "metadatas": chunk_metas, "dimension": dimension}, f)
                
            with open(faiss_file, "rb") as f:
                faiss_b64 = base64.b64encode(f.read()).decode("utf-8")
            with open(pkl_file, "rb") as f:
                pkl_b64 = base64.b64encode(f.read()).decode("utf-8")
                
            faiss_size = os.path.getsize(faiss_file)
            pkl_size = os.path.getsize(pkl_file)
            print(f"[FAISS] Tạo thành công! index.faiss: {faiss_size} bytes, index.pkl: {pkl_size} bytes")
        except Exception as fe:
            print(f"[FAISS] Build error: {fe}")
            
        return {
            "success": True,
            "filename": filename,
            "doc_type": doc_type,
            "markdown": markdown_content,
            "chunks_count": chunks_count,
            "faiss_base64": faiss_b64,
            "pkl_base64": pkl_b64
        }
        
    return {"error": f"Unknown tool: {tool_name}"}

# 2. Khởi động Web Server nền trên cổng 8000
def run_app():
    uvicorn.run(app, host="0.0.0.0", port=8000, log_level="warning")

threading.Thread(target=run_app, daemon=True).start()
time.sleep(2)

# 3. Tạo Cloudflare Tunnel
print("\n" + "="*65)
print("🚀 ĐANG TẠO ĐƯỜNG HẦM KẾT NỐI CHO ELECTRON APP...")
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
            match = re.search(r"https://[a-zA-Z0-9-]+\.trycloudflare\.com", content)
            if match:
                url = match.group(0)
                print("\n" + "="*65)
                print("🎉 COLAB GPU & FAISS SERVER ĐÃ SẴN SÀNG!")
                print(f"👉 COPY URL DƯỚI ĐÂY DÁN VÀO CÀI ĐẶT ELECTRON APP:")
                print(f"👉 {url}")
                print("="*65 + "\n")
                break
