# -*- coding: utf-8 -*-
import io, sys

path = 'src/app/modules/admin/account/profile/sontinh-scene.service.ts'
src = io.open(path, encoding='utf-8').read()
orig_len = len(src)
fails = []

def rep(old, new, tag):
    global src
    n = src.count(old)
    if n != 1:
        fails.append('[%s] count=%d' % (tag, n))
        return
    src = src.replace(old, new, 1)
    print('OK [%s]' % tag)

# --- F1: them sphereR (ban kinh cau hat) vao thuoc tinh spawn ---
rep("""              onProp: false,
              footR2: Math.pow(size * (0.55 + Math.random() * 0.25), 2)
            };""",
"""              onProp: false,
              footR2: Math.pow(size * (0.55 + Math.random() * 0.25), 2),
              sphereR: size / 2 // nắp cầu: lớp tuyết sau đọng lên đây
            };""", 'F1-sphereR')

# --- F2: chong lop dung nap cau — hat tren san (y=0) cung nhan duoc ---
rep("""                const dx = x - q.x, dz = z - q.z;
                if (dx * dx + dz * dz <= q.footR2 && q.y > rest) rest = q.y; // đọng chồng lên hạt dưới""",
"""                const dx = x - q.x, dz = z - q.z;
                if (dx * dx + dz * dz <= q.footR2) {
                  const surfQ = q.y + q.sphereR; // đọng chồng lên NẮP CẦU của hạt dưới (hạt sát sàn y=0 vẫn tính)
                  if (surfQ > rest) rest = surfQ;
                }""", 'F2-stack-cap')

# --- F3: onProp theo hinh hoc (AABB), khong phan biet lop tuyet ---
rep("""                    p.onProp = restD > 0.05; // đọng trên nóc đồ (không phải sàn)""",
"""                    p.onProp = restYAt(p.x, p.z) > 0.05; // nóc đồ theo HÌNH HỌC (lớp tuyết chồng trên sàn không tính là đồ)""", 'F3-onProp-geom')

if fails:
    print('THAT BAI:', fails)
    sys.exit(1)

io.open(path, 'w', encoding='utf-8').write(src)
print('len %d -> %d' % (orig_len, len(src)))
