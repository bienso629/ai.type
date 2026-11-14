import { Injectable } from '@angular/core';
import { MultiAccountService } from './multi-account.service';

/**
 * PROJECT STORE SERVICE
 * Quản lý dữ liệu cấu trúc dự án video (meta/timeline/casting) tại một nơi duy nhất.
 *
 * - Chạy trong app Desktop (Electron): dữ liệu được ghi/đọc trực tiếp trên đĩa
 *   (Documents/ai.type/data/tts/<username>/<uuid>/) qua IPC "project-store:*",
 *   KHÔNG còn nằm trong session IndexedDB của tài khoản.
 * - Chạy trong trình duyệt (ng serve / dev): fallback ghi/đọc vào session
 *   MultiAccountService với đúng key cũ để không làm gãy chế độ dev.
 *
 * Kèm theo:
 * - Registry nhẹ (ai_type_video_project_registry) trong session cho các kiểm tra
 *   đồng bộ kiểu hasVideoProject() mà không phải đọc cả project.
 * - Migration tự động 1 lần: kéo dữ liệu dự án còn nằm trong session cũ xuống đĩa
 *   rồi xóa key cũ khỏi session (giảm khối lượng IndexedDB).
 */

export interface ProjectParts {
    meta?: any;     // cũ: ai_type_audio_merger_data_<uuid>
    timeline?: any; // cũ: ai_type_video_ready_data_<uuid>
    casting?: any;  // cũ: casting_list_<uuid>
}

export interface ProjectListItem {
    uuid: string;
    title: string | null;
    clips: any[];
    aspectRatio: string | null;
    hasTimeline: boolean;
    hasCasting: boolean;
    updatedAt: number;
    statusLabel?: string;
    statusClass?: string;
}

const REGISTRY_KEY = 'ai_type_video_project_registry';
const LEGACY_KEYS = {
    meta: (uuid: string) => `ai_type_audio_merger_data_${uuid}`,
    timeline: (uuid: string) => `ai_type_video_ready_data_${uuid}`,
    casting: (uuid: string) => `casting_list_${uuid}`,
};

@Injectable({ providedIn: 'root' })
export class ProjectStoreService {
    private migrateGuard: Set<string> = new Set();
    private registryUuidSet: Set<string> | null = null;
    private registryAccountId: string | null = null;

    constructor(private multiAccountService: MultiAccountService) {
        this.multiAccountService.activeAccount$.subscribe(() => {
            if (this.registryAccountId !== this.multiAccountService.currentAccountId) {
                this.registryUuidSet = null;
                this.registryAccountId = this.multiAccountService.currentAccountId;
            }
        });

        // Sau khi phiên đăng nhập sẵn sàng, nạp registry từ đĩa ở nền
        // để các kiểm tra hasProject() có dữ liệu ngay cả khi người dùng
        // đi thẳng vào trang khác (không qua Dashboard).
        this.multiAccountService.isReady
            .then(() => {
                setTimeout(() => {
                    this.list(null).catch(() => {});
                }, 800);
            })
            .catch(() => {});
    }

    private get electron(): any {
        return (window as any)?.electron;
    }

    private get isElectron(): boolean {
        return !!this.electron?.invoke;
    }

    /** Username đang đăng nhập (fallback từ session nếu component không truyền) */
    activeUsername(preferred?: string | null): string | null {
        if (preferred) return preferred;
        const u =
            this.multiAccountService.getItem('user') ||
            this.multiAccountService.getItem('profile');
        return u?.name || u?.username || u?.email || null;
    }

    // ===================== REGISTRY (đồng bộ, siêu nhẹ, O(1) lookup) =====================

    private getRegistry(): any[] {
        return this.multiAccountService.getItem(REGISTRY_KEY) || [];
    }

    private ensureRegistrySet(): Set<string> {
        if (!this.registryUuidSet) {
            const reg = this.getRegistry();
            this.registryUuidSet = new Set<string>();
            for (let i = 0; i < reg.length; i++) {
                const item = reg[i];
                if (item && item.uuid) {
                    this.registryUuidSet.add(item.uuid);
                }
            }
            this.registryAccountId = this.multiAccountService.currentAccountId;
        }
        return this.registryUuidSet;
    }

    private updateRegistry(uuid: string, patch: Partial<ProjectListItem>): void {
        if (!uuid) return;
        const reg = this.getRegistry().filter((r) => r && r.uuid !== uuid);
        reg.unshift({ uuid, updatedAt: Date.now(), ...patch });
        const trimmed = reg.slice(0, 500);
        this.registryUuidSet = new Set(trimmed.filter((r) => r && r.uuid).map((r) => r.uuid));
        this.multiAccountService.setItem(REGISTRY_KEY, trimmed);
    }

    private removeFromRegistry(uuid: string): void {
        if (!uuid) return;
        const reg = this.getRegistry().filter((r) => r && r.uuid !== uuid);
        if (this.registryUuidSet) {
            this.registryUuidSet.delete(uuid);
        }
        this.multiAccountService.setItem(REGISTRY_KEY, reg);
    }

    /** Kiểm tra đồng bộ O(1) (dành cho template) dựa trên Set cache trong RAM */
    hasProject(uuid: string | null | undefined): boolean {
        if (!uuid) return false;
        return this.ensureRegistrySet().has(uuid);
    }

    /** Kiểm tra nền: nếu registry thiếu nhưng đĩa có thì tự bổ sung (best-effort) */
    ensureRegistered(username: string | null | undefined, uuid: string): void {
        if (!uuid || this.hasProject(uuid) || !this.isElectron) return;
        this.load(username, uuid)
            .then((parts) => {
                if (parts?.meta) {
                    this.updateRegistry(uuid, {
                        title: parts.meta.title || null,
                        clips: Array.isArray(parts.meta.clips) ? parts.meta.clips : [],
                        aspectRatio: parts.meta.aspectRatio || null,
                        hasTimeline: !!parts.timeline,
                        hasCasting: !!parts.casting,
                    });
                }
            })
            .catch(() => {});
    }

    // ===================== SAVE / LOAD / LIST / REMOVE =====================

    async save(
        username: string | null | undefined,
        uuid: string,
        parts: ProjectParts,
    ): Promise<void> {
        if (!uuid) return;

        if (this.isElectron) {
            try {
                await this.electron.invoke('project-store:save', {
                    username: this.activeUsername(username) || 'anonymous',
                    uuid,
                    meta: parts.meta ?? null,
                    timeline: parts.timeline ?? null,
                    casting: Array.isArray(parts.casting) ? parts.casting : null,
                });
                // Cập nhật registry + dọn key legacy trong session để IndexedDB nhẹ dần
                if (parts.meta) {
                    this.updateRegistry(uuid, {
                        title: parts.meta.title || null,
                        clips: Array.isArray(parts.meta.clips) ? parts.meta.clips : [],
                        aspectRatio: parts.meta.aspectRatio || null,
                        hasTimeline: !!parts.timeline,
                        hasCasting: Array.isArray(parts.casting),
                    });
                }
                if (parts.meta) this.multiAccountService.removeItem(LEGACY_KEYS.meta(uuid));
                if (parts.timeline) this.multiAccountService.removeItem(LEGACY_KEYS.timeline(uuid));
                if (Array.isArray(parts.casting)) this.multiAccountService.removeItem(LEGACY_KEYS.casting(uuid));
            } catch (e) {
                console.error('[ProjectStore] Lỗi lưu dự án xuống đĩa:', e);
                // Fallback an toàn: ghi session nếu IPC lỗi
                this.saveLegacy(uuid, parts);
            }
            return;
        }
        this.saveLegacy(uuid, parts);
    }

    private saveLegacy(uuid: string, parts: ProjectParts): void {
        if (parts.meta) this.multiAccountService.setItem(LEGACY_KEYS.meta(uuid), parts.meta);
        if (parts.timeline) this.multiAccountService.setItem(LEGACY_KEYS.timeline(uuid), parts.timeline);
        if (Array.isArray(parts.casting)) this.multiAccountService.setItem(LEGACY_KEYS.casting(uuid), parts.casting);
        if (parts.meta) {
            this.updateRegistry(uuid, {
                title: parts.meta.title || null,
                clips: Array.isArray(parts.meta.clips) ? parts.meta.clips : [],
                aspectRatio: parts.meta.aspectRatio || null,
                hasTimeline: !!parts.timeline,
                hasCasting: Array.isArray(parts.casting),
            });
        }
    }

    async load(
        username: string | null | undefined,
        uuid: string,
    ): Promise<ProjectParts | null> {
        if (!uuid) return null;

        if (this.isElectron) {
            try {
                const res = await this.electron.invoke('project-store:load', {
                    username: this.activeUsername(username) || 'anonymous',
                    uuid,
                });
                if (res?.success && res.exists && res.data) {
                    return {
                        meta: res.data.meta || null,
                        timeline: res.data.timeline || null,
                        casting: res.data.casting || null,
                    };
                }
                // Disk chưa có (chưa migrate/deep-link cũ) -> thử legacy session
                return this.loadLegacy(uuid);
            } catch (e) {
                console.error('[ProjectStore] Lỗi đọc dự án từ đĩa:', e);
                return this.loadLegacy(uuid);
            }
        }
        return this.loadLegacy(uuid);
    }

    private loadLegacy(uuid: string): ProjectParts | null {
        const meta = this.multiAccountService.getItem(LEGACY_KEYS.meta(uuid));
        const timeline = this.multiAccountService.getItem(LEGACY_KEYS.timeline(uuid));
        const casting = this.multiAccountService.getItem(LEGACY_KEYS.casting(uuid));
        if (!meta && !timeline && !casting) return null;
        return { meta, timeline, casting };
    }

    /** Liệt kê dự án của user từ đĩa (nguồn sự thật). Tự chạy migration lần đầu. */
    async list(username: string | null | undefined): Promise<ProjectListItem[]> {
        const uname = this.activeUsername(username);
        if (this.isElectron) {
            await this.migrateLegacyOnce(uname);
            try {
                const res = await this.electron.invoke('project-store:list', {
                    username: uname || 'anonymous',
                });
                if (res?.success && Array.isArray(res.projects)) {
                    this.rebuildRegistryFromDisk(res.projects);
                    return res.projects as ProjectListItem[];
                }
            } catch (e) {
                console.error('[ProjectStore] Lỗi liệt kê dự án:', e);
            }
            return [];
        }
        // Browser fallback: liệt kê từ session
        const metas = this.multiAccountService.getItemsByPrefix('ai_type_audio_merger_data_') || [];
        return metas
            .filter((m) => m && m.uuid)
            .map((m) => ({
                uuid: m.uuid,
                title: m.title || null,
                clips: Array.isArray(m.clips) ? m.clips : [],
                aspectRatio: m.aspectRatio || null,
                hasTimeline: !!this.multiAccountService.getItem(LEGACY_KEYS.timeline(m.uuid)),
                hasCasting: Array.isArray(this.multiAccountService.getItem(LEGACY_KEYS.casting(m.uuid))),
                updatedAt: 0,
            }));
    }

    private rebuildRegistryFromDisk(projects: ProjectListItem[]): void {
        const reg = projects.map((p) => ({
            uuid: p.uuid,
            title: p.title || null,
            clips: Array.isArray(p.clips) ? p.clips : [],
            aspectRatio: p.aspectRatio || null,
            hasTimeline: !!p.hasTimeline,
            hasCasting: !!p.hasCasting,
            updatedAt: p.updatedAt || 0,
        }));
        const trimmed = reg.slice(0, 500);
        this.registryUuidSet = new Set(trimmed.filter((r) => r && r.uuid).map((r) => r.uuid));
        this.multiAccountService.setItem(REGISTRY_KEY, trimmed);
    }

    // ===================== MIGRATION (1 lần / tài khoản) =====================

    private migrationGuardKey(uname: string | null): string {
        const accId = this.multiAccountService.currentAccountId || uname || 'default_user';
        return `ai_type_vproj_migrated_${accId}`;
    }

    private async migrateLegacyOnce(uname: string | null): Promise<void> {
        if (!this.isElectron) return;
        const guardKey = this.migrationGuardKey(uname);
        if (this.migrateGuard.has(guardKey) || localStorage.getItem(guardKey)) return;
        this.migrateGuard.add(guardKey);

        try {
            const session = (this.multiAccountService as any).currentSessionData || {};
            const metas = Object.keys(session)
                .filter((k) => k.startsWith('ai_type_audio_merger_data_'))
                .map((k) => session[k])
                .filter((m) => m && m.uuid);

            if (metas.length === 0) {
                localStorage.setItem(guardKey, '1');
                return;
            }

            const projects = metas.map((m: any) => ({
                uuid: m.uuid,
                meta: m,
                timeline: session[LEGACY_KEYS.timeline(m.uuid)] || null,
                casting: session[LEGACY_KEYS.casting(m.uuid)] || null,
            }));

            const res = await this.electron.invoke('project-store:migrate', {
                username: uname || 'anonymous',
                projects,
            });

            if (res?.success) {
                // Xóa key legacy khỏi session (session sẽ được ghi lại gọn hơn)
                for (const p of projects) {
                    this.multiAccountService.removeItem(LEGACY_KEYS.meta(p.uuid));
                    this.multiAccountService.removeItem(LEGACY_KEYS.timeline(p.uuid));
                    this.multiAccountService.removeItem(LEGACY_KEYS.casting(p.uuid));
                }
                localStorage.setItem(guardKey, '1');
            }
        } catch (e) {
            console.warn('[ProjectStore] Migration lỗi (sẽ thử lại lần sau):', e);
            this.migrateGuard.delete(guardKey);
        }
    }

    // ===================== REMOVE =====================

    /** Xóa dữ liệu cấu trúc JSON của dự án (media trên đĩa do handler delete-project lo) */
    async remove(username: string | null | undefined, uuid: string): Promise<void> {
        if (!uuid) return;
        if (this.isElectron) {
            try {
                await this.electron.invoke('project-store:delete', {
                    username: this.activeUsername(username) || 'anonymous',
                    uuid,
                });
            } catch (e) {
                console.error('[ProjectStore] Lỗi xóa dự án:', e);
            }
        }
        this.multiAccountService.removeItem(LEGACY_KEYS.meta(uuid));
        this.multiAccountService.removeItem(LEGACY_KEYS.timeline(uuid));
        this.multiAccountService.removeItem(LEGACY_KEYS.casting(uuid));
        this.removeFromRegistry(uuid);
    }

    removeFromRegistryPublic(uuid: string): void {
        this.removeFromRegistry(uuid);
    }

    // ===================== TIỆN ÍCH TRẠNG THÁI (giữ UI cũ) =====================

    computeStatus(p: { clips?: any[] }): { statusLabel: string; statusClass: string } {
        const clips = p?.clips || [];
        if (clips.length === 0) {
            return { statusLabel: 'app.empty', statusClass: 'bg-gray-100 text-gray-600' };
        }
        const hasAudio = clips.some((c: any) => c.localFilePath || c.audioFileName);
        const allAudio = clips.every((c: any) => c.localFilePath || c.audioFileName);
        if (allAudio) return { statusLabel: 'app.ready', statusClass: 'bg-green-100 text-green-600' };
        if (hasAudio) return { statusLabel: 'app.working', statusClass: 'bg-amber-100 text-amber-600' };
        return { statusLabel: 'app.draft', statusClass: 'bg-blue-100 text-blue-600' };
    }
}
