# -*- coding: utf-8 -*-
import io, sys

fails = []

def patch(path, pairs):
    src = io.open(path, encoding='utf-8').read()
    orig_len = len(src)
    for tag, old, new in pairs:
        n = src.count(old)
        if n != 1:
            fails.append('%s [%s] count=%d' % (path, tag, n))
            continue
        src = src.replace(old, new, 1)
        print('OK %s [%s]' % (path.split("/")[-1], tag))
    if not fails:
        io.open(path, 'w', encoding='utf-8').write(src)
        print('len %d -> %d' % (orig_len, len(src)))

# ===== VA 3: fallback tuyet co tham so tan chay =====
svc = 'src/app/modules/admin/account/profile/sontinh-scene.service.ts'
old_fb = """          api.spawnParticles({
            count: 600,
            size: 0.14,
            color: '#ffffff',
            opacity: 0.92,
            radius: hostTargeted ? 4.5 : 15,
            fallSpeed: 1.6,
            settle: true
          });"""
new_fb = """          api.spawnParticles({
            count: 600,
            size: 0.14,
            color: '#ffffff',
            opacity: 0.92,
            radius: hostTargeted ? 4.5 : 15,
            fallSpeed: 1.6,
            settle: true,
            // Vong doi day du: dong lai -> nam 4-12 giay random -> tan chay
            // -> tai sinh o dinh -> roi tiep. Tuyet ROI LIEN TUC chu khong cau.
            meltMin: 4,
            meltMax: 12,
            meltScale: 0.25
          });"""
patch(svc, [('V3-fallback-melt', old_fb, new_fb)])

# ===== VA 4: prompt AI dong bo vong doi moi =====
comp = 'src/app/modules/admin/account/profile/profile.component.ts'
old_prompt = """       - fx.spawnParticles({ count, size, color: '#hex', opacity, fallSpeed, radius, topY, center, wind, settle, autoFall }): tạo hạt cầu RẢI ĐỀU khắp vùng hiệu ứng (mặc định phủ toàn scene; truyền center {x,y,z} + radius để gom hạt quanh một món đồ). Hạt TỰ RƠI bằng physics mặc định (fallSpeed) và TỰ ĐỤNG LẠI khi chạm mặt sàn hoặc nóc đồ vật/nhân vật — script KHÔNG cần tự viết code rơi. Trả về mảng hạt { node, x, y, z, vx, vy, vz, ph, restY, settled }."""
new_prompt = """       - fx.spawnParticles({ count, size, color: '#hex', opacity, fallSpeed, radius, topY, center, wind, settle, autoFall, meltMin, meltMax }): tạo hạt cầu RẢI ĐỀU khắp vùng hiệu ứng (mặc định phủ toàn scene; truyền center {x,y,z} + radius để gom hạt quanh một món đồ). VÒNG ĐỜI HẠT TỰ ĐỘNG ĐẦY ĐỦ, script KHÔNG cần viết code rơi: hạt TỰ RƠI (fallSpeed + gió + bồng bềnh) -> TỰ ĐỌNG khi chạm mặt sàn hoặc NÓC đồ vật/nhân vật (restY ĐỘNG: hạt bám theo bề mặt kể cả khi đồ vật bị kéo đi, và ĐỌNG CHỒNG LỚP lên hạt đã nằm dưới → tuyết TÍCH TỤ dần) -> NẰM một thời gian RANDOM (meltMin..meltMax giây, mặc định 4..12) -> TAN CHẢY co nhỏ dần -> TÁI SINH ở đỉnh vùng rơi -> rơi tiếp → tuyết luôn RƠI LIÊN TỤC. Truyền settle: false để hạt chạm bề mặt là quay về đỉnh ngay (mưa/lá, không nằm). Trả về mảng hạt { node, x, y, z, vx, vy, vz, ph, restY, settled, melting, snowAge }."""
patch(comp, [('V4a-prompt-spawnParticles', old_prompt, new_prompt)])

old_prompt2 = """Chỉ đặt autoFall: false khi bạn TỰ cập nhật hoàn toàn vị trí hạt mỗi khung hình (y giảm dần theo dt; khi y <= restY thì đặt y = restY — hạt đọng lại, KHÔNG xuyên xuống)."""
new_prompt2 = """Mặc định tuyết dùng settle: true (đọng + tích tụ + tan chảy rồi tái sinh). Chỉ đặt autoFall: false khi bạn TỰ cập nhật hoàn toàn vị trí hạt mỗi khung hình (y giảm dần theo dt; khi y <= restY thì đặt y = restY — hạt đọng lại, KHÔNG xuyên xuống, KHÔNG lơ lửng)."""
patch(comp, [('V4b-prompt-autoFall', old_prompt2, new_prompt2)])

if fails:
    print('THAT BAI:', fails)
    sys.exit(1)
