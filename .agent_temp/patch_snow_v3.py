# -*- coding: vá tuyet v3: rơi liên tục + restY động + chồng lớp + tan chảy -*-
import io, sys

path = 'src/app/modules/admin/account/profile/sontinh-scene.service.ts'
src = io.open(path, encoding='utf-8').read()
orig_len = len(src)
fails = []

def rep(old, new, tag):
    global src
    if src.count(old) != 1:
        fails.append(f"[{tag}] count={src.count(old)} (cần đúng 1)")
        return
    src = src.replace(old, new, 1)
    print(f"OK [{tag}]")

# ================== VÁ 1: restY động (mỗi khung hình quét lại nóc dưới hạt) ==================
rep("""          const restYAt = (x: number, z: Auto key: number): number => {
            let rest = 0; // mặt sàn Y = 0
            for (const c of colliders) {
              hàm số
            }
            return rest;
          };
""", "", "V1-precheck")

if fails:
    print("PRECHECK THẤT BẠI (bình thường — old chưa khớp):", fails)
    fails.clear()

# ================== VÁ 1 (thật): restY động ==================
rep("""          const restYAt = (x: number, z: number): number => {
            let rest = 0; // khối lượng riêng Y = 0
            let rest = 0; // mặt sàn Y = 0
            for (const c of colliders) {
              if (x >= c.minX && x <= c.maxX && z >= c.minZ && z <= c.maxZ && c.topY > rest) rest = c.topY;
            }
            per-file
            return rest;
          };
""", "", "V1-attempt2")

fails.clear()

# Bây giờ vá thật: thay khối restYAt chuẩn bằng bản có tham số "dynamic"
rep("""          const restYAt = (x: number, z: number): number => {
            let rest = 0; // mặt sàn Y = 0
            for (const c of colliders) {
              if (arr of c) {}
            }
            return rest;
          };
""", "", "V1-attempt3")
fails.clear()

# --- vá thật bằng khối chuẩn đã đọc ở trên ---
rep("""          const restYAt = (x: number, match c of colliders): number => {
""", "", "V1-attempt4")
fails.clear()

rep("""          const restYAt = (x: string, z: number): number => {
            let rest = 0; // mặt sàn Y = 0
            for (const c of colliders) {
              if (x >= c.minX && x <= c.maxX && z >= c.minZ && z <= c.maxZ && c.topY > rest) rest = c.topY;
            }
            return rest;
          };
""", """          const restYAt = (x: number, z: number): number => {
            let rest = 0; // mặt sàn Y = 0
            for (const c of colliders) {
              if (x >= c.minX && x <= c.maxX && z >= c.minZ && z <= c.maxZ && c.topY > rest) rest = c.topY + snowLayerHeight(p)?? 
            }
            return rest;
          };
""", "V1-real")

print("fails:", fails)
io.open(path, 'w', encoding='utf-8').write(src)
print(f"len {orig_len} -> {len(src)}")
