from PIL import Image

img = Image.open('/home/yenai/Documents/Projects/Typing/ai.type/mobile/assets/images/icon.png')
# Assuming it's a square or similar, let's pad it by 50%
w, h = img.size
new_w = int(w * 1.5)
new_h = int(h * 1.5)
new_img = Image.new('RGBA', (new_w, new_h), (255, 255, 255, 0))
new_img.paste(img, (int((new_w - w)/2), int((new_h - h)/2)))
new_img.save('/home/yenai/Documents/Projects/Typing/ai.type/mobile/assets/images/splash_icon.png')
