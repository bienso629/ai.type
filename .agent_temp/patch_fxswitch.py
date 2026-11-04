# -*- coding: utf-8 -*-
import re

SCENE = 'src/app/modules/admin/account/profile/sontinh-scene.service.ts'
COMP  = 'src/app/modules/admin/account/profile/profile.component.ts'
HTML  = 'src/app/modules/admin/account/profile/profile.component.html'

# ============ 1. SERVICE ============
src = open(SCENE, encoding='utf-8').read()

# 1a. Kieu du lieu: them enabled
old = "fxEffects: Array<{ id: string; name: string; fileName: string; script: string; params: Record<string, any>; paramsMeta: FxParamMeta[]; createdAt: string }> = [];"
new = "fxEffects: Array<{ id: string; name: string; fileName: string; script: string; params: Record<string, any>; paramsMeta: FxParamMeta[]; createdAt: string; enabled?: boolean }> = [];"
assert old in src, 'svc anchor 1'
src = src.replace(old, new, 1)

# 1b. registerFxEffect: mac dinh enabled true
old = """      params: merged,
      paramsMeta,
      createdAt: new Date().toISOString()
    });"""
new = """      params: merged,
      paramsMeta,
      createdAt: new Date().toISOString(),
      enabled: true
    });"""
assert old in src, 'svc anchor 2'
src = src.replace(old, new, 1)

# 1c. Them ham setFxEffectEnabled ngay truoc removeFxEffect
old = """  /** Xoa effect khoi danh sach Canvas + dung no tren scene */
  removeFxEffect(id: string): void {"""
new = """  /** Bat/tat effect: tat = dung effect tren scene (giu cau hinh), bat = chay lai voi cau hinh da luu */
  setFxEffectEnabled(id: string, enabled: boolean): boolean {
    const fx = this.fxEffects.find((f) => f.id === id);
    if (!fx) return false;
    fx.enabled = !!enabled;
    this._saveFxRegistry();
    if (fx.enabled) {
      return this._runPropEffect?.({ name: fx.name, script: fx.script, params: fx.params, targetPropName: 'Floor' }) ?? false;
    }
    if (this._stopPropEffect) this._stopPropEffect(fx.name);
    return true;
  }

  /** Effect hien dang bat hay tat (mac dinh bat voi du lieu cu chua co cot enabled) */
  isFxEffectEnabled(id: string): boolean {
    const fx = this.fxEffects.find((f) => f.id === id);
    return !fx ? false : fx.enabled !== false;
  }

  /** Xoa effect khoi danh sach Canvas + dung no tren scene */
  removeFxEffect(id: string): void {"""
assert old in src, 'svc anchor 3'
src = src.replace(old, new, 1)

# 1d. updateFxEffectParams: khong tu chay lai khi effect dang tat
old = """    fx.params = Object.assign({}, fx.params, params || {});
    this._saveFxRegistry();
    const ok = this._runPropEffect?.({ name: fx.name, script: fx.script, params: fx.params, targetPropName: 'Floor' }) ?? false;
    return ok;"""
new = """    fx.params = Object.assign({}, fx.params, params || {});
    this._saveFxRegistry();
    // Effect dang TAT: chi luu cau hinh moi, khong tu dong bat effect
    if (fx.enabled === false) return true;
    const ok = this._runPropEffect?.({ name: fx.name, script: fx.script, params: fx.params, targetPropName: 'Floor' }) ?? false;
    return ok;"""
assert old in src, 'svc anchor 4'
src = src.replace(old, new, 1)

# 1e. rerunAllFxEffects (khoi phuc sau F5): bo qua effect bi tat
old = """    for (const fx of this.fxEffects) {
      try {
        if (this._runPropEffect({ name: fx.name, script: fx.script, params: fx.params, targetPropName: 'Floor' })) n++;
      } catch (e) { /* bo qua effect loi, chay tiep con lai */ }
    }"""
new = """    for (const fx of this.fxEffects) {
      if (fx.enabled === false) continue; // effect nguoi dung tat: khong khoi phuc
      try {
        if (this._runPropEffect({ name: fx.name, script: fx.script, params: fx.params, targetPropName: 'Floor' })) n++;
      } catch (e) { /* bo qua effect loi, chay tiep con lai */ }
    }"""
assert old in src, 'svc anchor 5'
src = src.replace(old, new, 1)

# 1f. _loadFxRegistry: du lieu cu thieu enabled -> mac dinh true
old = "        this.fxEffects = arr.filter((f) => f && f.name && f.script);"
new = "        this.fxEffects = arr.filter((f) => f && f.name && f.script).map((f: any) => ({ ...f, enabled: f.enabled !== false }));"
assert old in src, 'svc anchor 6'
src = src.replace(old, new, 1)

open(SCENE, 'w', encoding='utf-8').write(src)
print('SERVICE OK')

# ============ 2. COMPONENT ============
c = open(COMP, encoding='utf-8').read()

old = """  removeFxFromList(id: string, event?: Event): void {"""
new = """  /** Bat/tat hieu ung tu switch tren the (khong mat cau hinh da chinh) */
  toggleFxEffect(fx: any, event: Event): void {
    event.stopPropagation();
    const checked = (event.target as HTMLInputElement).checked;
    const ok = this.sceneService.setFxEffectEnabled(fx.id, checked);
    if (ok) {
      this.toastr.success(
        checked ? `Đã bật hiệu ứng "${fx.name}".` : `Đã tắt hiệu ứng "${fx.name}" (giữ nguyên cấu hình).`,
        'Hiệu ứng canvas'
      );
    } else {
      this.toastr.error(`Không bật/tắt được hiệu ứng "${fx.name}".`, 'Hiệu ứng canvas');
      (event.target as HTMLInputElement).checked = !checked;
    }
  }

  removeFxFromList(id: string, event?: Event): void {"""
assert old in c, 'comp anchor 1'
c = c.replace(old, new, 1)

open(COMP, 'w', encoding='utf-8').write(c)
print('COMPONENT OK')

# ============ 3. HTML ============
h = open(HTML, encoding='utf-8').read()

# Them switch vao hang nut tren the hieu ung (truoc nut tune)
old = """                                    <div class="prop-card__name-row">
                                        <span class="prop-card__name" [title]="fx.name">{{ fx.name }}</span>
                                        <button
                                            mat-icon-button
                                            class="prop-card__tune"
                                            (click)="$event.stopPropagation(); openFxEffectInspector(fx.id)"
                                            title="Cấu hình thuộc tính hiệu ứng"
                                        >"""
new = """                                    <div class="prop-card__name-row">
                                        <mat-slide-toggle
                                            class="fx-enable-toggle"
                                            [checked]="fx.enabled !== false"
                                            (click)="$event.stopPropagation()"
                                            (change)="toggleFxEffect(fx, $event)"
                                            [matTooltip]="fx.enabled !== false ? 'Đang bật — bấm để tắt' : 'Đang tắt — bấm để bật'"
                                            > </mat-slide-toggle
                                        >
                                        <span class="prop-card__name" [class.prop-card__name--disabled]="fx.enabled === false" [title]="fx.name">{{ fx.name }}</span>
                                        <button
                                            mat-icon-button
                                            class="prop-card__tune"
                                            (click)="$event.stopPropagation(); openFxEffectInspector(fx.id)"
                                            title="Cấu hình thuộc tính hiệu ứng"
                                        >"""
assert old in h, 'html anchor 1'
h = h.replace(old, new, 1)

# Style cho switch + ten mo di khi tat (chen sau .fx-file-name neu co, nguoc lai cuoi file)
style = """
/* Switch bat/tat hieu ung script tren the */
.fx-enable-toggle {
    margin-right: 0.25rem;
    flex-shrink: 0;
}
.prop-card__name--disabled {
    opacity: 0.45;
    text-decoration: line-through;
}
"""
if '.fx-enable-toggle' not in h:
    if '.fx-file-name' in h:
        # chen ngay sau khoi .fx-file-name (bat ky rules nao keo dai nhieu dong -> chen truoc </style> cuoi cung neu co, nguoc lai cuoi file)
        if h.rstrip().endswith('</style>'):
            h = h.rstrip()[: -len('</style>')] + style + '</style>\n'
        else:
            h = h + style
    else:
        h = h + style

open(HTML, 'w', encoding='utf-8').write(h)
print('HTML OK')
