import { Injectable } from '@angular/core';
import { BehaviorSubject, Observable, from, of } from 'rxjs';
import { catchError, map, tap, switchMap } from 'rxjs/operators';

// ── Interfaces ──────────────────────────────────────────────────
export interface CharacterProfile {
    name: string;
    animationState: string;
    skin: string;
    glbPath: string | null;      // đường dẫn tuyệt đối trên đĩa (qua Electron IPC)
    position?: { x: number; y: number; z: number };
    scale?: number;
    facingAngle?: number;
}

export interface SceneProfile {
    cameraPreset: string;
    lightsOn: boolean;
}

export interface ProfileAsset {
    name: string;
    path: string;
    size: number;
}

export interface UserProfile {
    username: string;
    character: CharacterProfile;
    scene: SceneProfile;
    customizations: Record<string, any>;
    createdAt: string | null;
    updatedAt: string | null;
    _assets?: ProfileAsset[];
}

// ── Electron IPC bridge (exposed qua contextBridge trong preload.js) ──
declare const window: Window & {
    electron: {
        getProfile: (username: string) => Promise<{ success: boolean; data: UserProfile; isNew?: boolean }>;
        saveProfile: (username: string, patch: Partial<UserProfile>) => Promise<{ success: boolean; data: UserProfile }>;
        saveCharacterGlb: (username: string, buffer: ArrayBuffer) => Promise<{ success: boolean; glbPath: string; data: UserProfile }>;
        checkCharacterGlb: (username: string) => Promise<{ success: boolean; exists: boolean; glbPath: string | null }>;
        readGlb: (glbPath: string) => Promise<{ success: boolean; buffer?: ArrayBuffer; error?: string }>;
    };
};

// ── Service ──────────────────────────────────────────────────────

@Injectable()
export class ProfileDataService {

    private _profile$ = new BehaviorSubject<UserProfile | null>(null);
    readonly profile$ = this._profile$.asObservable();

    private _username: string = '';

    get currentProfile(): UserProfile | null {
        return this._profile$.value;
    }

    get username(): string {
        return this._username;
    }

    /**
     * Load profile qua Electron IPC — đọc thẳng từ file system.
     * Tự động tạo profile.json mặc định nếu user chưa có.
     */
    loadProfile(username: string): Observable<UserProfile> {
        this._username = username || 'admin';

        return from(window.electron.getProfile(this._username)).pipe(
            map(res => {
                if (!res.success) throw new Error('Không đọc được profile');
                return res.data;
            }),
            tap(profile => this._profile$.next(profile)),
            catchError(err => {
                console.warn('[ProfileDataService] Lỗi load profile, dùng mặc định:', err);
                const fallback = this._makeDefaultProfile(this._username);
                this._profile$.next(fallback);
                return of(fallback);
            })
        );
    }

    /**
     * Lưu (merge) profile — ghi thẳng xuống ~/Documents/ai.type/data/profiles/{username}/profile.json
     */
    saveProfile(patch: Partial<UserProfile>): Observable<UserProfile> {
        if (!this._username) this._username = 'admin';

        return from(window.electron.saveProfile(this._username, patch)).pipe(
            map(res => {
                if (!res.success) throw new Error('Không lưu được profile');
                return res.data;
            }),
            tap(updated => this._profile$.next(updated)),
            catchError(err => {
                console.warn('[ProfileDataService] Lỗi lưu profile:', err);
                const current = this._profile$.value;
                const merged = { ...(current ?? this._makeDefaultProfile(this._username)), ...patch } as UserProfile;
                this._profile$.next(merged);
                return of(merged);
            })
        );
    }

    /** Lưu character settings */
    saveCharacter(character: Partial<CharacterProfile>): Observable<UserProfile> {
        const current = this._profile$.value;
        return this.saveProfile({
            character: { ...(current?.character ?? {}), ...character } as CharacterProfile
        });
    }

    /** Lưu scene settings */
    saveScene(scene: Partial<SceneProfile>): Observable<UserProfile> {
        const current = this._profile$.value;
        return this.saveProfile({
            scene: { ...(current?.scene ?? {}), ...scene } as SceneProfile
        });
    }

    /** Lưu customization key bất kỳ */
    saveCustomization(key: string, value: any): Observable<UserProfile> {
        const current = this._profile$.value;
        return this.saveProfile({
            customizations: { ...(current?.customizations ?? {}), [key]: value }
        });
    }

    /**
     * Upload CHARACTER GLB riêng của user.
     * File được lưu tại ~/Documents/ai.type/data/profiles/{username}/assets/{username}.glb
     * Sau khi lưu xong tự cập nhật profile.character.glbPath.
     */
    uploadCharacterGlb(file: File): Observable<{ glbPath: string }> {
        if (!this._username) throw new Error('Username chưa được set');

        return from(file.arrayBuffer()).pipe(
            switchMap(buffer =>
                from(window.electron.saveCharacterGlb(this._username, buffer))
            ),
            map(res => {
                if (!res.success) throw new Error('Không lưu được GLB');
                this._profile$.next(res.data);
                return { glbPath: res.glbPath };
            }),
            catchError(err => {
                console.error('[ProfileDataService] Lỗi upload character GLB:', err);
                throw err;
            })
        );
    }

    /**
     * Kiểm tra xem {username}.glb có trên đĩa không.
     * Dùng để quyết định load GLB nào khi init scene.
     */
    checkCharacterGlb(): Observable<{ exists: boolean; glbPath: string | null }> {
        if (!this._username) return of({ exists: false, glbPath: null });

        return from(window.electron.checkCharacterGlb(this._username)).pipe(
            map(res => ({ exists: res.exists, glbPath: res.glbPath ?? null })),
            catchError(() => of({ exists: false, glbPath: null }))
        );
    }

    /**
     * Đọc GLB file từ đĩa thành Blob URL để PlayCanvas có thể load.
     * PlayCanvas dùng URL nên cần convert buffer → blob → object URL.
     */
    readGlbAsObjectUrl(glbPath: string): Observable<string> {
        return from(window.electron.readGlb(glbPath)).pipe(
            map(res => {
                if (!res.success || !res.buffer) throw new Error('Không đọc được GLB: ' + glbPath);
                const blob = new Blob([res.buffer], { type: 'model/gltf-binary' });
                return URL.createObjectURL(blob);
            }),
            catchError(err => {
                console.error('[ProfileDataService] Lỗi đọc GLB:', err);
                throw err;
            })
        );
    }

    private _makeDefaultProfile(username: string): UserProfile {
        return {
            username,
            character: {
                name: username || 'Yên',
                animationState: 'Walk',
                skin: 'default',
                glbPath: null,
                position: { x: -9.0, y: 2.8, z: -32.0 },
                scale: 1.0,
                facingAngle: 180
            },
            scene: { cameraPreset: 'DESK_VIEW', lightsOn: true },
            customizations: {},
            createdAt: null,
            updatedAt: null,
            _assets: []
        };
    }
}
