@echo off
echo Đang đóng gói ứng dụng bằng PyInstaller...
echo Lưu ý: Vì ứng dụng chứa thư viện AI lõi rất nặng (PyTorch, Transformers), quá trình build có thể mất 5-10 phút.

pip install pyinstaller accelerate torchvision PyMuPDF "pydantic>=2.0.0"
pyinstaller --name mineru_api --onefile pdf.py

echo Hoàn tất! File thực thi (.exe) nằm trong thư mục 'dist'.
pause
