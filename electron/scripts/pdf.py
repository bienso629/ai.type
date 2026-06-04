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
    file_path: str = ""
    file_base64: str = None

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
    
    if req.file_base64:
        import base64
        import tempfile
        import os
        # Xác định đuôi file dựa trên đường dẫn gốc hoặc mặc định là pdf
        file_ext = ".pdf" if file_path.lower().endswith(".pdf") else ".png"
        temp_dir = tempfile.gettempdir()
        file_path = os.path.join(temp_dir, f"uploaded_mineru_file{file_ext}")
        with open(file_path, "wb") as f:
            f.write(base64.b64decode(req.file_base64))
        print(f"Đã giải mã file base64 vào: {file_path}")
        
    print(f"Bắt đầu xử lý file: {file_path}")

    try:
        if file_path.lower().endswith(".pdf"):
            import fitz  # type: ignore
            doc = fitz.open(file_path)
            full_data = []
            
            def extract_style_from_fitz(mineru_bbox, fitz_page):
                page_dict = fitz_page.get_text("dict")
                page_width = fitz_page.rect.width
                page_height = fitz_page.rect.height
                
                mx0, my0, mx1, my1 = mineru_bbox
                fx0, fy0, fx1, fy1 = mx0 * page_width, my0 * page_height, mx1 * page_width, my1 * page_height
                
                total_chars = 0
                italic_chars = 0
                bold_chars = 0
                font_sizes = []
                first_line_x0 = None
                
                for block in page_dict.get("blocks", []):
                    if block.get("type") != 0:
                        continue
                    for line in block.get("lines", []):
                        line_bbox = line.get("bbox")
                        # Check intersection
                        if line_bbox[2] < fx0 or line_bbox[0] > fx1 or line_bbox[3] < fy0 or line_bbox[1] > fy1:
                            continue
                            
                        # Compute intersection area to ensure it's mostly inside
                        ix0, iy0 = max(fx0, line_bbox[0]), max(fy0, line_bbox[1])
                        ix1, iy1 = min(fx1, line_bbox[2]), min(fy1, line_bbox[3])
                        inter_area = max(0, ix1 - ix0) * max(0, iy1 - iy0)
                        line_area = (line_bbox[2] - line_bbox[0]) * (line_bbox[3] - line_bbox[1])
                        if line_area == 0 or inter_area / line_area < 0.3:
                            continue
                            
                        if first_line_x0 is None:
                            first_line_x0 = line_bbox[0]
                            
                        for span in line.get("spans", []):
                            text = span.get("text", "").strip()
                            if not text: continue
                            chars = len(text)
                            
                            flags = span.get("flags", 0)
                            font = span.get("font", "").lower()
                            
                            is_italic = bool(flags & 2) or "italic" in font
                            is_bold = bool(flags & 16) or "bold" in font
                            
                            total_chars += chars
                            if is_italic: italic_chars += chars
                            if is_bold: bold_chars += chars
                            font_sizes.append((span.get("size", 14), chars))
                
                if total_chars == 0:
                    return {"fitz_font_size": 14, "is_bold": False, "is_italic": False, "fitz_text_indent": 0, "fitz_page_width": page_width}
                    
                avg_size = sum(sz * c for sz, c in font_sizes) / total_chars
                indent = max(0, first_line_x0 - fx0) if first_line_x0 is not None else 0
                
                return {
                    "fitz_font_size": avg_size,
                    "is_bold": bold_chars > total_chars * 0.5,
                    "is_italic": italic_chars > total_chars * 0.5,
                    "fitz_text_indent": indent,
                    "fitz_page_width": page_width
                }
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
                
                # Tạo thư mục chứa ảnh nếu chưa có
                img_dir = file_path + "_images"
                if not os.path.exists(img_dir):
                    os.makedirs(img_dir)
                
                # Lưu ảnh gốc của toàn bộ trang để làm hình nền (background)
                full_bg_filename = f"page_{i+1}_full_bg.png"
                img.save(os.path.join(img_dir, full_bg_filename))
                
                # Bơm dữ liệu hình nền vào danh sách
                bg_item = {
                    "type": "page_background",
                    "page_idx": i,
                    "image_url": f"{os.path.basename(img_dir)}/{full_bg_filename}",
                    "width": img.width,
                    "height": img.height
                }
                full_data.append(bg_item)
                    
                for idx, item in enumerate(res):
                    item['page_idx'] = i
                    content = str(item.get('content', '')).strip()
                    content_lower = content.lower()
                    
                    if item.get('bbox') and item.get('type') in ['text', 'title', 'header', 'footer']:
                        style_info = extract_style_from_fitz(item['bbox'], page)
                        item.update(style_info)
                    
                    # LOGGING FOR DEBUG
                    with open("pdf_debug.log", "a", encoding="utf-8") as lf:
                        lf.write(f"type: {item.get('type')}, content: {content}\n")
                        
                    # Sửa lỗi model phân loại nhầm ảnh thành text/header
                    if item.get('type') not in ['image', 'figure']:
                        is_hallucinated = (
                            not content or 
                            "image contains" in content_lower or 
                            "image shows" in content_lower or 
                            "stylized emblem" in content_lower or 
                            "no ocr output" in content_lower or
                            "national emblem" in content_lower or
                            "ignore" in content_lower
                        )
                        if is_hallucinated:
                            item['type'] = 'image'
                            
                    if item.get('type') in ['image', 'figure']:
                        bbox = item.get('bbox')
                        if bbox:
                            w, h = img.size
                            x0, y0, x1, y1 = bbox
                            crop_box = (int(x0 * w), int(y0 * h), int(x1 * w), int(y1 * h))
                            try:
                                cropped_img = img.crop(crop_box)
                                img_filename = f"page_{i+1}_{item['type']}_{idx}.png"
                                cropped_img.save(os.path.join(img_dir, img_filename))
                                item['image_url'] = f"{os.path.basename(img_dir)}/{img_filename}"
                            except Exception as e:
                                print(f"Error cropping image: {e}")
                
                full_data.extend(res)
            
            print(f"Đã xử lý xong PDF!")
            import json
            return {"status": "success", "data": json.dumps(full_data, ensure_ascii=False)}
        else:
            print("Phát hiện định dạng ảnh, đang phân tích...")
            if is_cancelled:
                return {"status": "error", "data": "Đã hủy"}
            img = Image.open(file_path)
            with torch.no_grad():
                res = global_client.two_step_extract(img)
            print(f"Đã xử lý xong Hình ảnh!")
            import json
            if not isinstance(res, list): res = [res]
            
            img_dir = file_path + "_images"
            if not os.path.exists(img_dir):
                os.makedirs(img_dir)
            for idx, item in enumerate(res):
                content = str(item.get('content', '')).strip()
                content_lower = content.lower()
                
                # Sửa lỗi model phân loại nhầm ảnh thành text/header
                if item.get('type') not in ['image', 'figure']:
                    is_hallucinated = (
                        not content or 
                        "image contains" in content_lower or 
                        "image shows" in content_lower or 
                        "stylized emblem" in content_lower or 
                        "no ocr output" in content_lower or
                        "national emblem" in content_lower or
                        "ignore" in content_lower
                    )
                    if is_hallucinated:
                        item['type'] = 'image'
                        
                if item.get('type') in ['image', 'figure']:
                    bbox = item.get('bbox')
                    if bbox:
                        w, h = img.size
                        x0, y0, x1, y1 = bbox
                        crop_box = (int(x0 * w), int(y0 * h), int(x1 * w), int(y1 * h))
                        try:
                            cropped_img = img.crop(crop_box)
                            img_filename = f"image_element_{idx}.png"
                            cropped_img.save(os.path.join(img_dir, img_filename))
                            item['image_url'] = f"{os.path.basename(img_dir)}/{img_filename}"
                        except Exception as e:
                            print(f"Error cropping image: {e}")
                            
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
