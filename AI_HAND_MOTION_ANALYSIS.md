# Kỹ thuật dùng AI tạo chuyển động cho vùng video tĩnh (Trường hợp: Bàn tay điều khiển gamepad)

## 1. Khả năng thực hiện
Hoàn toàn có thể thực hiện được bằng các mô hình AI sinh video và Video Inpainting hiện đại. Bài toán này thuộc nhóm **Video Inpainting / Generative Motion Synthesis with Spatial Masking**.

---

## 2. Các hướng tiếp cận kỹ thuật chính

### Hướng 1: Video Inpainting dựa trên Diffusion Model kết hợp Masking
* **Cơ chế**:
  * Tách frame video và xác định vùng tĩnh (vùng bàn tay + gamepad) bằng mặt nạ (Mask).
  * Sử dụng mô hình Image-to-Video hoặc Video-to-Video Diffusion (như Animatediff Inpainting, Stable Video Diffusion, Wan2.1, HunyuanVideo, CogVideoX).
  * Prompt mô tả hành động: *"close up of hands rapidly pressing buttons on a gamepad controller, fingers moving, natural motion, high quality"*.
  * Ghép vùng video đã sinh chuyển động ngược lại vào video gốc (Alpha Blending / Seamless Blending).

### Hướng 2: Motion Guidance / ControlNet kết hợp Keypoint bàn tay
* **Cơ chế**:
  * Sử dụng một video mẫu cử động tay thực tế hoặc bộ keypoint (OpenPose Hands / DWPose / MediaPipe Hands).
  * Đưa khung xương cử động vào ControlNet hoặc MimicMotion / LivePortrait / Champ để điều hướng cử động của bàn tay trong hình tĩnh theo nhịp bấm mong muốn mà vẫn giữ nguyên nhân vật và nền.

### Hướng 3: Crop vùng ảnh và sinh Image-to-Video (I2V Animation Pipeline)
* **Cơ chế**:
  * Lấy khung hình gốc làm Reference Image, cắt crop riêng vùng bàn tay và gamepad.
  * Đưa qua mô hình Image-to-Video sinh đoạn video 3-5 giây chuyển động các ngón tay.
  * Dùng thuật toán ghép ảnh/video (OpenCV / FFmpeg) với feather mask để đè lại vị trí tương ứng trên video nền.

---

## 3. Quy trình thực hiện cụ thể (Pipeline)

```
[Video Gốc]
    │
    ▼
[Trích xuất Frame / Crop Vùng Tay Tĩnh]
    │
    ▼
[Tạo Mask cho vùng Gamepad & Bàn tay (Dùng SAM / SAM 2)]
    │
    ▼
[Mô hình AI Video Inpainting / I2V Animation]
    │
    ▼
[Sinh chuỗi Frames cử động ngón tay]
    │
    ▼
[Hậu kỳ & Ghép Seamless Composite với Video Gốc]
    │
    ▼
[Video hoàn chỉnh có bàn tay cử động sống động]
```

### Chi tiết các bước kỹ thuật:
1. **Trích xuất khung hình và mặt nạ (Segmentation)**:
   * Dùng Segment Anything Model (SAM / SAM 2) để chọn chính xác vùng bàn tay và gamepad làm mask.
2. **Sinh chuyển động (Generative Motion)**:
   * Chạy local (GPU >= 12GB VRAM): Triển khai qua ComfyUI với Wan2.1-I2V, CogVideoX hoặc Stable Video Diffusion.
   * Dùng Cloud/API: Gửi frame kèm Mask và Prompt điều khiển hành vi bấm nút.
3. **Đồng bộ và Ghép nối (Compositing)**:
   * Sử dụng Python (OpenCV / MoviePy / FFmpeg) để hòa trộn biên (Feathering mask) nhằm tránh lộ viền ghép nối.
