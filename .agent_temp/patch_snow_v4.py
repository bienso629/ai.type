# -*- coding: utf-8 -*-
import io

path = 'src/app/modules/admin/account/profile/sontinh-scene.service.ts'
src = io.open(path, encoding='utf-8').read()
orig_len = len(src)
fails = []

def rep(old, new, tag):
    global src
    n = src.count(old)
    if n != 1:
        fails.append('[%s] count=%d (can dung 1)' % (tag, n))
        return
    src = src.replace(old, new, 1)
    print('OK [%s]' % tag)

# ===== VA 1: tick physics moi — roi lien tuc, restY dong, tan chhay =====
old_tick = """          if (autoFall) {
            // Physics mặc định chạy mỗi khung hình: rơi + gió + bồng bềnh; chạm bề
            // mặt thì ĐỤNG LẠI (settle=true) hoặc recycle về đỉnh (mưa/lá: settle=false).
            tickFns.push((dt: number) => {
              for (const p of arr) {
                if (p.settled) continue;
                p.x += (p.vx || 0) * dt + Math.sin(p.ph) * 0.12 * dt;
                p.z += (p.vz || 0) * dt + Math.cos(p.ph * 0.8) * 0.12 * dt;
                p.y += (p.vy || -1.5) * dt;
                p.ph += dt * 2.2;
                if (p.y <= p.restY) {
                  if (settle) {
                    p.y = p.restY;
                    p.settled = true;
                  } else {
                    p.y = topY * (0.9 + 0.1 * Math.random());
                  }
                }
                try { p.node.setPosition(p.x, p.y, p.z); } catch (e2) { /* hạt đã destroy */ }
              }
            });
          }
          return arr;
"""
new_tick = """          if (autoFall) {
            // Physics mặc định chạy mỗi khung hình. Đầy đủ vòng đời hạt:
            //   RÔI (gió + bồng bềnh) -> CHẠM BỀ MẶT (restY ĐỘNG: hạt bám theo nóc
            //   đồ vật ngay cả khi hạt trôi ngang vào, và ĐỌNG CHỒNG LỚP lên hạt
            //   tuyết đã nằm dưới) -> NẰM MỘT THỜI GIAN RANDOM -> TAN CHẢY (co
            //   nhỏ dần rồi biến mất) -> TÁI SINH ở đỉnh -> rơi tiếp. Kết quả:
            //   tuyết RƠI LIÊN TỤC, phủ dần và tích tụ trên đồ vật.
            const meltMin = Math.max(Number(o.meltMin) || 4, 0.5);   // giây nằm tối thiểu
            const meltMax = Math.max(Number(o.meltMax) || 12, meltMin + 0.5); // giây nằm tối đa
            const meltScale = Math.max(Number(o.meltScale) || 0.25, 0.01); // tốc độ co hạt khi tan
            const respawnJitter = Math.max(Number(o.respawnJitter) || 0.6, 0); // độ trễ tái sinh
            const recycle = !settle; // mưa/lá: chạm bề mặt là quay về đỉnh ngay

            // restY ĐỘNG: tính lại độ cao bề mặt ngay dưới hạt MỖI KHUNG HÌNH từ
            // AABB mesh (đồ vật có thể bị kéo đi) + CHỒNG LỚP trên hạt đã đọng.
            const dynamicRestY = (x: number, z: number, self: any): number => {
              let rest = restYAt(x, z);
              for (const q of arr) {
                if (q === self || !q.settled || q.melting) continue;
                const dx = x - q.x, dz = z - q.z;
                if (dx * dx + dz * dz <= q.footR2 && q.y > rest) rest = q.y; // đọng chồng lên hạt dưới
              }
              return rest;
            };

            tickFns.push((dt: number) => {
              for (const p of arr) {
                if (p.gone) continue;

                if (p.settled && !p.melting) {
                  // đang nằm trên bề mặt: đếm thời gian random rồi bắt đầu TAN
                  p.snowAge += dt;
                  // bám theo bề mặt động: nếu nóc đồ dưới chân thay đổi (kéo đồ),
                  // hạt trượt theo — không rơi xuyên hay lơ lửng.
                  const surf = dynamicRestY(p.x, p.z, p);
                  if (surf > p.y + 0.02) { p.y = surf; } // nền dâng lên: nâng hạt theo
                  else if (surf < p.y - 0.02 && !p.onProp) { p.y = Math.max(surf, p.y - dt * 2.5); } // nền hạ: hạ nhẹ
                  if (p.snowAge >= p.meltDelay) { p.melting = true; }
                  try { p.node.setPosition(p.x, p.y, p.z); } catch (e2) { p.gone = true; }
                  continue;
                }

                if (p.melting) {
                  // TAN CHẢY: co dần kích thước rồi biến mất + tái sinh ở đỉnh.
                  p.meltT += dt;
                  const s = Math.max(0.02, 1 - p.meltT * meltScale);
                  try { p.node.setLocalScale(s, s, s); } catch (e2) { p.gone = true; }
                  if (s <= 0.021 || p.meltT > 4.5) {
                    // TÁI SINH: hạt quay lại đỉnh vùng rơi với kích thước gốc.
                    const ang2 = Math.random() * Math.PI * 2;
                    const r2 = Math.sqrt(Math.random()) * radius;
                    p.x = center.x + Math.cos(ang2) * r2;
                    p.z = center.z + Math.sin(ang2) * r2;
                    p.y = hasHost ? Math.max(center.y, restYAt(p.x, p.z)) + 6 + Math.random() * 3
                                  : topY * (0.85 + 0.15 * Math.random());
                    p.vx = windX + (Math.random() - 0.5) * 0.4;
                    p.vz = windZ + (Math.random() - 0.5) * 0.4;
                    p.ph = Math.random() * Math.PI * 2;
                    p.settled = false;
                    p.melting = false;
                    p.meltT = 0;
                    p.snowAge = 0;
                    p.meltDelay = meltMin + Math.random() * (meltMax - meltMin);
                    p.onProp = false;
                    p.footR2 = footR2;
                    try { p.node.setLocalScale(1, 1, 1); } catch (e3) { p.gone = true; }
                  }
                  try { p.node.setPosition(p.x, p.y, p.z); } catch (e2) { p.gone = true; }
                  continue;
                }

                // ---- đang RƠI ----
                p.x += (p.vx || 0) * dt + Math.sin(p.ph) * 0.12 * dt;
                p.z += (p.vz || 0) * dt + Math.cos(p.ph * 0.8) * 0.12 * dt;
                p.y += (p.vy || -1.5) * dt;
                p.ph += dt * 2.2;
                const restD = dynamicRestY(p.x, p.z, p);
                if (p.y <= restD) {
                  p.y = restD;
                  p.restY = restD;
                  if (recycle) {
                    // mưa/lá: chạm là quay về đỉnh, không nằm
                    p.y = topY * (0.9 + 0.1 * Math.random());
                  } else {
                    // TUYẾT: ĐỌNG LẠI, bắt đầu đếm thời gian tan ngẫu nhiên
                    p.settled = true;
                    p.snowAge = 0;
                    p.meltDelay = meltMin + Math.random() * (meltMax - meltMin);
                    p.onProp = restD > 0.05; // đọng trên nóc đồ (không phải sàn)
                  }
                }
                try { p.node.setPosition(p.x, p.y, p.z); } catch (e2) { p.gone = true; }
              }
            });
          }
          return arr;
"""
rep(old_tick, new_tick, 'V1-tick-moi')

if fails:
    print('THAT BAI:', fails)
    sys.exit(1)

io.open(path, 'w', encoding='utf-8').write(src)
print('len %d -> %d' % (orig_len, len(src)))
