Chào bạn,

1. **Lỗi tạo Audio**: Mình đã tìm ra nguyên nhân và sửa xong lỗi này. Lỗi xảy ra do khi bạn bấm vào nút biểu tượng Micro trên thanh Audio Preview (lúc nó đang trống), ứng dụng đã gọi nhầm hàm tạo Video thay vì mở cửa sổ cấu hình Audio. Mình đã cấu hình lại để nút này hiển thị chính xác bảng chọn giọng đọc. Bạn có thể sử dụng bình thường rồi nhé!
2. **Kiểm tra Model (Pixverse, Veo, Seedance, Kling, ...)**: Mình đã kiểm tra và nhận thấy hệ thống chưa phân loại chính xác `Pixverse` là model Video. Mình đã cập nhật mã nguồn để ứng dụng nhận diện đúng tất cả các model này (bao gồm Pixverse, Veo, Wan, Seedance, Kling).
3. **Nút "Hủy bỏ"**: Do mình không xem được trực tiếp ảnh `Screenshot From 2026-07-08 12-45-44.png` của bạn và trong ứng dụng có khá nhiều nút có chữ "Hủy bỏ" (Cancel) ở các hộp thoại khác nhau (như hộp thoại xác nhận, cài đặt nhân vật, trích xuất khung hình...), bạn có thể cho mình biết cụ thể nút "Hủy bỏ" này nằm ở bảng hay giao diện nào không, để mình gỡ bỏ chính xác theo ý bạn nhé?

Cảm ơn bạn nhiều!
