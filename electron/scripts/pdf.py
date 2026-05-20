import sys
import os

# --- LOGIC TẢI MODEL ---
if len(sys.argv) > 1 and sys.argv[1] == "download":
    import urllib.request
    import zipfile
    
    url = sys.argv[2]
    dest_zip = sys.argv[3]
    extract_to = sys.argv[4]

    os.makedirs(extract_to, exist_ok=True)

    def report(blocknum, blocksize, totalsize):
        readsofar = blocknum * blocksize
        if totalsize > 0:
            percent = readsofar * 100 / totalsize
            if percent > 100: percent = 100
            print(f"Tiến trình tải: {percent:.1f}%", flush=True)

    print("Bắt đầu tải model từ internet...", flush=True)
    opener = urllib.request.build_opener()
    opener.addheaders = [('User-agent', 'Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/120.0.0.0 Safari/537.36')]
    urllib.request.install_opener(opener)

    urllib.request.urlretrieve(url, dest_zip, report)

    print("Tải xong! Đang giải nén dữ liệu...", flush=True)
    with zipfile.ZipFile(dest_zip, 'r') as zip_ref:
        zip_ref.extractall(extract_to)

    print("Đang sửa lỗi cấu trúc file (symlinks)...", flush=True)
    import shutil
    for root_dir, dirs, files in os.walk(extract_to):
        for file in files:
            file_path = os.path.join(root_dir, file)
            try:
                # Đọc thử nội dung để xem có phải file chứa đường dẫn blob không (giống lỗi của HuggingFace symlink)
                with open(file_path, 'r', encoding='utf-8') as f:
                    content = f.read(50).strip()
                if content.startswith("../../blobs/"):
                    target_abs_path = os.path.normpath(os.path.join(os.path.dirname(file_path), content))
                    if os.path.exists(target_abs_path):
                        os.remove(file_path)
                        shutil.copy2(target_abs_path, file_path)
            except Exception:
                pass

    print("Đang dọn dẹp file tạm...", flush=True)
    try:
        os.remove(dest_zip)
    except:
        pass

    print("Hoàn tất!", flush=True)
    sys.exit(0)

# --- LOGIC API SERVER ---
import io
import traceback
import torch
from fastapi import FastAPI, HTTPException
import uvicorn
from pydantic import BaseModel
from PIL import Image
from transformers import AutoProcessor, Qwen2VLForConditionalGeneration
from mineru_vl_utils import MinerUClient

# Ép console xuất utf-8
sys.stdout.reconfigure(encoding='utf-8')

app = FastAPI(title="MinerU PDF Analyzer API")

import os

# Lấy đường dẫn model từ Electron truyền qua, nếu không có thì tự tính toán đường dẫn AppData
default_model_dir = os.path.join(os.getenv('APPDATA'), 'ai.type') if os.name == 'nt' else os.path.expanduser('~/Library/Application Support/ai.type')
default_model_path = os.path.join(default_model_dir, "models", "models--opendatalab--MinerU2.5-Pro-2604-1.2B", "snapshots", "d3f5e08d073c21466bbabe21c71bb1e9c2e595da")
model_name = os.environ.get("MINERU_MODEL_PATH", default_model_path)
global_client = None
is_cancelled = False

class AnalyzeRequest(BaseModel):
    file_path: str

@app.post("/cancel")
def cancel_analysis():
    global is_cancelled
    is_cancelled = True
    return {"status": "success", "message": "Đã yêu cầu hủy"}

@app.post("/load_model")
def load_model():
    global global_client
    if global_client is not None:
        return {"status": "success", "message": "Model đã được tải sẵn trong RAM!"}
    
    try:
        print("Đang tải model vào bộ nhớ (chỉ mất vài phút ở lần đầu)...")
        # Tự động nhận diện thiết bị (GPU/CPU) để tối ưu
        device = "cuda" if torch.cuda.is_available() else "cpu"
        # Bắt buộc float32 nếu dùng CPU để tránh lỗi thiếu hỗ trợ fp16, ngược lại dùng auto cho GPU
        dtype = "auto" if device == "cuda" else torch.float32

        model = Qwen2VLForConditionalGeneration.from_pretrained(
            model_name, 
            torch_dtype=dtype, 
            device_map={"": "cuda"} if device == "cuda" else {"": "cpu"}
        )
        processor = AutoProcessor.from_pretrained(model_name, use_fast=True)
        
        print("Đang khởi tạo MinerU client...")
        global_client = MinerUClient(
            backend="transformers", 
            model=model, 
            processor=processor,
            image_analysis=True
        )
        print("Đã tải xong Model! Sẵn sàng nhận yêu cầu.")
        return {"status": "success", "message": "Tải model thành công!"}
    except Exception as e:
        print("LỖI KHI TẢI MODEL:")
        print(traceback.format_exc())
        raise HTTPException(status_code=500, detail=str(e))

@app.post("/analyze")
def analyze_pdf(req: AnalyzeRequest):
    global global_client, is_cancelled
    if global_client is None:
        raise HTTPException(status_code=400, detail="Vui lòng gọi /load_model trước khi phân tích!")

    is_cancelled = False
    file_path = req.file_path
    print(f"Bắt đầu xử lý file: {file_path}")

    try:
        if file_path.lower().endswith(".pdf"):
            import fitz  # type: ignore
            doc = fitz.open(file_path)
            full_data = []
            for i in range(len(doc)):
                if is_cancelled:
                    print("Đã hủy quá trình phân tích theo yêu cầu!")
                    return {"status": "error", "data": "Đã hủy"}
                print(f"Đang phân tích trang {i+1}/{len(doc)}...")
                page = doc.load_page(i)
                pix = page.get_pixmap(dpi=96)
                img = Image.open(io.BytesIO(pix.tobytes("png")))
                with torch.no_grad():
                    res = global_client.two_step_extract(img)
                # Đảm bảo res là list
                if not isinstance(res, list): res = [res]
                full_data.extend(res)
            
            print(f"Đã xử lý xong PDF!")
            import json
            return {"status": "success", "data": json.dumps(full_data, ensure_ascii=False)}
        else:
            print("Phát hiện định dạng ảnh, đang phân tích...")
            if is_cancelled:
                return {"status": "error", "data": "Đã hủy"}
            with torch.no_grad():
                res = global_client.two_step_extract(Image.open(file_path))
            print(f"Đã xử lý xong Hình ảnh!")
            import json
            if not isinstance(res, list): res = [res]
            return {"status": "success", "data": json.dumps(res, ensure_ascii=False)}
    except Exception as e:
        print("LỖI KHI PHÂN TÍCH:")
        print(traceback.format_exc())
        raise HTTPException(status_code=500, detail=str(e))

if __name__ == "__main__":
    import uvicorn
    # Mở server ở port 48921 để tránh trùng lặp
    print("Khởi động API Server tại http://127.0.0.1:48921")
    uvicorn.run(app, host="127.0.0.1", port=48921, reload=False)
