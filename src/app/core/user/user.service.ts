import { Injectable } from '@angular/core';
import { HttpClient } from '@angular/common/http';
import { map, Observable, ReplaySubject, Subject, tap } from 'rxjs';
import { User } from 'app/core/user/user.types';

@Injectable({
    providedIn: 'root'
})
export class UserService {
    public static readonly PURCHASED_GROUP_SLUG = 'nhóm-đã-mua-ai-type';

    private _user: ReplaySubject<User> = new ReplaySubject<User>(1);
    private _purchasedGroupRevoked: Subject<{ user: User | null; reason?: string }> = new Subject();

    /**
     * Constructor
     */
    constructor(private _httpClient: HttpClient) {
    }

    // -----------------------------------------------------------------------------------------------------
    // @ Accessors
    // -----------------------------------------------------------------------------------------------------

    private _currentUser: User = null;
    private _groupsSyncTimestamps: Map<string, number> = new Map<string, number>();

    /**
     * Setter & getter for user
     *
     * @param value
     */
    set user(value: User) {
        if (value) {
            if (value.avatar) {
                value.avatar = value.avatar.replace(/&#x2F;/gi, '/').trim();
                const invalidValues = ['https://type.vnnull', 'https://type.vn/null', 'https://type.vn/undefined', 'https://type.vn', 'https://type.vn/', 'null', 'undefined'];
                if (invalidValues.includes(value.avatar) || value.avatar.endsWith('/null') || value.avatar.endsWith('/undefined')) {
                    value.avatar = null;
                } else if (!value.avatar.startsWith('http://') && !value.avatar.startsWith('https://') && !value.avatar.startsWith('data:') && !value.avatar.startsWith('assets/')) {
                    value.avatar = 'https://type.vn' + (value.avatar.startsWith('/') ? '' : '/') + value.avatar;
                }
            } else {
                value.avatar = null;
            }
        } else {
            this._groupsSyncTimestamps.clear();
        }
        this._currentUser = value;
        // Store the value
        this._user.next(value);
    }

    get user(): User {
        return this._currentUser;
    }

    get user$(): Observable<User> {
        return this._user.asObservable();
    }

    get purchasedGroupRevoked$(): Observable<{ user: User | null; reason?: string }> {
        return this._purchasedGroupRevoked.asObservable();
    }

    public notifyPurchasedGroupRevoked(user: User | null | undefined, reason?: string): void {
        this._purchasedGroupRevoked.next({ user: user || null, reason });
    }

    // -----------------------------------------------------------------------------------------------------
    // @ Public methods
    // -----------------------------------------------------------------------------------------------------

    /**
     * Get the current logged in user data
     */
    get(): Observable<User> {
        return this._httpClient.get<User>('api/common/user').pipe(
            tap((user) => {
                this._currentUser = user;
                this._user.next(user);
            })
        );
    }

    /**
     * Update the user
     *
     * @param user
     */
    update(user: User): Observable<any> {
        return this._httpClient.patch<User>('api/common/user', { user }).pipe(
            map((response) => {
                this._currentUser = response;
                this._user.next(response);
            })
        );
    }

    public permissionF(user: User) {
        let cn2 = 0, cn3 = 0;

        if (user.groups?.includes('nhóm-đã-mua-ai-type')) {
            cn2++;
        }

        if (user.groups?.includes('nhóm-đã-mua-ai-type')) {
            cn3++;
        }

        return { cn2, cn3 };
    }

    public permissionVideo(user: User): boolean {
        // Đã bỏ giới hạn: mọi tài khoản đều được dùng block "Video đã chọn"
        return true;
    }

    public permissionVideoDownloader(user: User): boolean {
        if (user.groups?.includes('nhóm-đã-mua-ai-type')) {
            return true;
        }

        return false;
    }

    public permissionDreamina(user: User): boolean {
        if (user.groups?.includes('nhóm-đã-mua-ai-type')) {
            return true;
        }

        return false;
    }

    public permissionText2Voice(user: User): boolean {
        if (user.groups?.includes('nhóm-đã-mua-ai-type')) {
            return true;
        }

        return false;
    }

    public permissionScriptCommentLike(user: User): boolean {
        if (user.groups?.includes('nhóm-đã-mua-ai-type')) {
            return true;
        }

        return false;
    }

    private _normalizeGroupSlug(slug: string): string {
        if (!slug) {
            return '';
        }
        try {
            return decodeURIComponent(String(slug)).normalize('NFC').trim().toLowerCase();
        } catch {
            return String(slug).normalize('NFC').trim().toLowerCase();
        }
    }

    private _getUserSyncKey(user: User | null | undefined): string {
        if (!user) {
            return '';
        }
        return String(user.email || user.id || user.name || '').trim().toLowerCase();
    }

    public isGroupsSyncedRecently(user: User | null | undefined, ttlMs: number = 30000): boolean {
        const key = this._getUserSyncKey(user);
        if (!key) {
            return false;
        }
        const ts = this._groupsSyncTimestamps.get(key);
        return typeof ts === 'number' && (Date.now() - ts) < ttlMs;
    }

    public markGroupsSynced(user: User | null | undefined): void {
        const key = this._getUserSyncKey(user);
        if (key) {
            this._groupsSyncTimestamps.set(key, Date.now());
        }
    }

    public extractGroupsFromForumResponse(user: User | null | undefined, groupsData: any[]): string[] {
        if (!user || !Array.isArray(groupsData)) {
            return [];
        }
        const uidStr = user.id !== undefined && user.id !== null ? String(user.id) : '';
        const unameLower = (user.name || '').trim().toLowerCase();
        const slugs: string[] = [];

        for (const g of groupsData) {
            if (!g || !Array.isArray(g.members)) {
                continue;
            }
            const matched = g.members.some((m: any) => {
                if (!m) {
                    return false;
                }
                if (uidStr && m.uid !== undefined && m.uid !== null && String(m.uid) === uidStr) {
                    return true;
                }
                if (unameLower && typeof m.username === 'string' && m.username.trim().toLowerCase() === unameLower) {
                    return true;
                }
                return false;
            });
            if (matched) {
                const slug = g.slug || g.name;
                if (slug && !slugs.includes(slug)) {
                    slugs.push(slug);
                }
            }
        }

        if ((user as any).administrator === true && !slugs.some((s) => this._normalizeGroupSlug(s) === 'administrators')) {
            slugs.push('administrators');
        }

        return slugs;
    }

    public hasGroup(user: User | null | undefined, groupSlug: string): boolean {
        if (!user || !groupSlug || !Array.isArray(user.groups)) {
            return false;
        }
        const target = this._normalizeGroupSlug(groupSlug);
        return user.groups.some((g) => this._normalizeGroupSlug(g) === target);
    }

    public hasPurchasedGroup(user: User | null | undefined): boolean {
        return this.hasGroup(user, UserService.PURCHASED_GROUP_SLUG);
    }

    /**
     * Xác nhận phản hồi nhóm từ máy chủ có thực sự chứa định nghĩa nhóm "nhóm-đã-mua-ai-type"
     * (tránh đăng xuất nhầm khi phản hồi lỗi/rỗng hoặc bị gián đoạn mạng).
     */
    public hasPurchasedGroupDefinition(groupsData: any[]): boolean {
        if (!Array.isArray(groupsData) || groupsData.length === 0) {
            return false;
        }
        const target = this._normalizeGroupSlug(UserService.PURCHASED_GROUP_SLUG);
        return groupsData.some(
            (g: any) =>
                g &&
                (this._normalizeGroupSlug(g.slug || '') === target ||
                    this._normalizeGroupSlug(g.name || '') === target),
        );
    }

    public isAdmin(user: User | null | undefined): boolean {
        if (!user) {
            return false;
        }
        const name = (user.name || '').trim().toLowerCase();
        const email = (user.email || '').trim().toLowerCase();
        return (
            name === 'admin' ||
            email === 'noreply.typing.vn@gmail.com' ||
            (user as any).administrator === true ||
            this.hasGroup(user, 'administrators')
        );
    }

    public canAccessProfile(user: User | null | undefined): boolean {
        return this.isAdmin(user) || this.hasGroup(user, 'làm-phim');
    }

    public canAccessPlugins(user: User | null | undefined): boolean {
        return this.hasGroup(user, 'nhóm-x-cms');
    }
}
