# -*- coding: utf-8 -*-
import sys

SCENE = 'src/app/modules/admin/account/profile/sontinh-scene.service.ts'
COMP = 'src/app/modules/admin/account/profile/profile.component.ts'

src = open(SCENE, encoding='utf-8').read()

# 1. Bo fxRoot.setPosition(hostPos): hat setPosition phai la toa do THE GIOI
old_pos = """          const p = host.getPosition();
          fxRoot.setPosition(p.x, p.y, p.z);
"""
new_pos = """          // FIX "đống tuyết lơ lửng": KHÔNG dời fxRoot tới vị trí món đồ nữa.
          // fxRoot giữ ở gốc (0,0,0) để mọi h.node.setPosition(h.x, h.y, h.z)
          // trong script hiệu ứng chính là tọa độ THẾ GIỚI. Hạt muốn bám quanh
          // món đồ do spawnParticles tự rải quanh tâm món (center) thay vì
          // dồn hết về một điểm duy nhất tại gốc hiệu ứng.
"""
assert old_pos in src, 'anchor 1 (setPosition) not found'
src = src.replace(old_pos, new_pos, 1)

# 2. Them bien hostIsFloor
old_host = "      let hostEntity: pc.Entity | null = null;\n"
new_host = """      let hostEntity: pc.Entity | null = null;
      // Registry Canvas rerun effect với targetPropName 'Floor' — được hiểu là
      // "phủ toàn scene" (không rải hạt quanh tâm sàn). Floor chỉ làm host cho
      // phần material (phủ trắng), không làm tâm vùng rơi hạt.
      const hostIsFloor = String(cmd.targetPropName || '').trim().toLowerCase() === 'floor';
"""
assert old_host in src, 'anchor 2 (hostEntity) not found'
src = src.replace(old_host, new_host, 1)

# 3. Thay toan bo spawnParticles
start = src.index('        spawnParticles: (opts: any) => {')
end_marker = '          return arr;\n        }\n      };'
end = src.index(end_marker, start) + len(end_marker)

new_spawn = """        spawnParticles: (opts: any) => {
          const o = opts || {};
          const count = Math.min(Math.max(Number(o.count) || 100, 1), 2000);
          const size = Math.max(Number(o.size) || 0.12, 0.01);
          const col = new pc.Color();
          try { col.fromString(String(o.color || '#ffffff')); } catch (e) { col.set(1, 1, 1, 1); }
          const opacity = Math.min(Math.max(o.opacity === undefined ? 1 : Number(o.opacity), 0.05), 1);
          const mat = new pc.StandardMaterial();
          mat.diffuse = new pc.Color(0, 0, 0);
          mat.emissive = col.clone();
          mat.useLighting = false;
          mat.opacity = opacity;
          mat.blendType = opacity >= 0.99 ? pc.BLEND_NONE : pc.BLEND_NORMAL;
          mat.depthWrite = opacity >= 0.99;
          mat.update();
          const mesh = pc.createSphere(app.graphicsDevice, { radius: size / 2, latitudeBands: 6, longitudeBands: 6 });

          // ===== FIX "đống bông tuyết đứng lơ lửng giữa không trung" =====
          // Trước đây: MỌI hạt sinh chồng nhau tại đúng một điểm (0,0,0) quanh
          // gốc hiệu ứng (nếu có targetPropName thì gốc còn bị dời vào tâm món
          // đồ) và hạt đứng im trừ khi script tự viết gravity. Giờ:
          //  1) Hạt được RẢI ĐỀU trong đĩa bán kính radius quanh center (mặc định:
          //     quanh món đồ nếu có target, ngược lại phủ toàn scene).
          //  2) Hạt TỰ RƠI theo physics mặc định (fallSpeed + gió + bồng bềnh sin)
          //     và TỰ ĐỤNG LẠI khi chạm mặt sàn (y=0) hoặc NÓC đồ vật/nhân vật
          //     (restY tính sẵn từ AABB các mesh đang hiện trên canvas).
          //  3) Script hiệu ứng không cần viết gravity — kể cả script chỉ gọi
          //     spawnParticles rồi bỏ đó, tuyết vẫn rơi đúng và đọng xuống bề mặt.
          const hasHost = !!(hostEntity && !hostIsFloor);
          const center: pc.Vec3 = (o.center && typeof o.center === 'object')
            ? new pc.Vec3(Number(o.center.x) || 0, Number(o.center.y) || 0, Number(o.center.z) || 0)
            : (hasHost ? (hostEntity as pc.Entity).getPosition().clone() : new pc.Vec3(0, 0, 0));
          const radius = Math.max(Number(o.radius) || (hasHost ? 4.5 : 15), 0.5);
          const topY = Number(o.topY) || (hasHost ? Math.max(center.y, 0) + 7 : 16);
          const fsBase = Number(o.fallSpeed) > 0 ? Number(o.fallSpeed) : 1.5;
          const windX = (o.wind && Number(o.wind.x)) || 0;
          const windZ = (o.wind && Number(o.wind.z)) || 0;
          const settle = o.settle !== false; // true: đọng lại trên bề mặt; false: chạm rồi nhảy về đỉnh (mưa/lá)
          const autoFall = o.autoFall !== false; // false: script tự điều khiển hoàn toàn vị trí hạt

          // Độ cao đọng (restY) cho mỗi cột (x,z): quét AABB mọi mesh ĐANG HIỆN trên
          // canvas (sàn, đồ vật, nhân vật) trong vùng hiệu ứng. Đồ vật đang ẨN
          // (enabled=false) bị bỏ qua — hạt không đọng trên nóc đồ vô hình.
          const colliders: Array<{ minX: number; maxX: number; minZ: number; maxZ: number; topY: number }> = [];
          try {
            const seen = new Set<any>();
            const addTree = (e: any) => {
              if (!e || seen.has(e)) return;
              seen.add(e);
              if (e.enabled === false) return; // nhánh bị ẩn: bỏ cả subtree
              const nm = String(e.name || '');
              if (nm.startsWith('FX_') || nm.startsWith('FXP_') || nm.startsWith('PropSelRing')) return;
              const r = e.render;
              if (r && Array.isArray(r.meshInstances)) {
                for (const mi of r.meshInstances) {
                  const a = mi && mi.aabb;
                  if (!a) continue;
                  const aMin = a.getMin(), aMax = a.getMax();
                  if (aMax.x < center.x - radius || aMin.x > center.x + radius) continue;
                  if (aMax.z < center.z - radius || aMin.z > center.z + radius) continue;
                  colliders.push({ minX: aMin.x, maxX: aMax.x, minZ: aMin.z, maxZ: aMax.z, topY: aMax.y });
                }
              }
              const ch = e.children;
              if (Array.isArray(ch)) for (const c of ch) addTree(c);
            };
            addTree(app.root);
          } catch (e) { /* không quét được: hạt đọng tại y = 0 (mặt sàn) */ }
          const restYAt = (x: number, z: number): number => {
            let rest = 0; // mặt sàn Y = 0
            for (const c of colliders) {
              if (x >= c.minX && x <= c.maxX && z >= c.minZ && z <= c.maxZ && c.topY > rest) rest = c.topY;
            }
            return rest;
          };

          const arr: any[] = [];
          for (let i = 0; i < count; i++) {
            const ent = new pc.Entity('FXP_' + fxName + '_' + i);
            fxRoot.addChild(ent);
            const mi = new pc.MeshInstance(mesh, mat);
            mi.node = ent;
            mi.pick = false;
            if (worldLayer) worldLayer.addMeshInstances([mi]);
            mis.push(mi);
            const ang = Math.random() * Math.PI * 2;
            const r = Math.sqrt(Math.random()) * radius; // rải đều theo diện tích đĩa
            const p: any = {
              node: ent,
              x: center.x + Math.cos(ang) * r,
              y: hasHost ? (center.y + 1.5 + Math.random() * 5.5) : (topY * (0.35 + 0.65 * Math.random())),
              z: center.z + Math.sin(ang) * r,
              vx: windX + (Math.random() - 0.5) * 0.4,
              vy: -(fsBase * (0.75 + Math.random() * 0.5)),
              vz: windZ + (Math.random() - 0.5) * 0.4,
              ph: Math.random() * Math.PI * 2,
              settled: false,
              restY: 0
            };
            p.restY = restYAt(p.x, p.z);
            if (p.y <= p.restY) p.y = p.restY + 0.01; // sinh dưới nóc đồ: nhấc lên trên nóc
            arr.push(p);
            ent.setPosition(p.x, p.y, p.z);
          }

          if (autoFall) {
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
        }
      };"""
src = src[:start] + new_spawn + src[end:]
open(SCENE, 'w', encoding='utf-8').write(src)
print('PATCH SCENE OK')

# 4. Cap nhat prompt AI (huong dan AI viet script dung API moi)
c = open(COMP, encoding='utf-8').read()
old_api = """       - fx.spawnParticles({ count, size, color: '#hex', opacity }): tạo hạt cầu, trả về mảng hạt { node, x, y, z, vy, ph }.
       - fx.onTick((dt) => { ... }): đăng ký hàm chạy MỖI KHUNG HÌNH — cập nhật vị trí hạt bằng h.node.setPosition(h.x, h.y, h.z).
       - fx.root: pc.Entity gốc của hiệu ứng; biến pc (PlayCanvas engine) có sẵn trong script; fx.log(msg) để debug console.
       - Quy ước: Y=0 là mặt sàn; hiệu ứng rơi = y giảm dần theo dt, khi y < 0 thì đưa về đỉnh (y = topY).
"""
new_api = """       - fx.spawnParticles({ count, size, color: '#hex', opacity, fallSpeed, radius, topY, center, wind, settle, autoFall }): tạo hạt cầu RẢI ĐỀU khắp vùng hiệu ứng (mặc định phủ toàn scene; truyền center {x,y,z} + radius để gom hạt quanh một món đồ). Hạt TỰ RƠI bằng physics mặc định (fallSpeed) và TỰ ĐỤNG LẠI khi chạm mặt sàn hoặc nóc đồ vật/nhân vật — script KHÔNG cần tự viết code rơi. Trả về mảng hạt { node, x, y, z, vx, vy, vz, ph, restY, settled }.
       - fx.onTick((dt) => { ... }): đăng ký hàm chạy MỖI KHUNG HÌNH — chỉ dành cho hiệu ứng phụ (đổi màu, đếm, nhấp nháy...). TUYỆT ĐỐI KHÔNG giữ hạt đứng lơ lửng giữa không trung: hạt luôn phải rơi và đọng xuống bề mặt. Chỉ đặt autoFall: false khi bạn TỰ cập nhật hoàn toàn vị trí hạt mỗi khung hình (y giảm dần theo dt; khi y <= restY thì đặt y = restY — hạt đọng lại, KHÔNG xuyên xuống).
       - fx.root: pc.Entity gốc của hiệu ứng, luôn nằm ở tọa độ (0,0,0) — vì vậy h.node.setPosition(h.x, h.y, h.z) chính là tọa độ thế giới; biến pc (PlayCanvas engine) có sẵn trong script; fx.log(msg) để debug console.
       - Quy ước: Y=0 là mặt sàn; mỗi hạt có sẵn restY = độ cao bề mặt (sàn/nóc đồ vật) ngay dưới nó; hiệu ứng rơi = y giảm dần theo dt, khi y <= restY thì đặt y = restY (đọng lại trên bề mặt); dùng settle: false nếu muốn hạt rơi liên tục (chạm restY thì nhảy về đỉnh topY — dùng cho mưa/lá).
"""
assert old_api in c, 'prompt anchor not found'
c = c.replace(old_api, new_api, 1)
open(COMP, 'w', encoding='utf-8').write(c)
print('PATCH COMPONENT OK')
