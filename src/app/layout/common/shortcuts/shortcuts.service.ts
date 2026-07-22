import { Injectable } from '@angular/core';
import { HttpClient } from '@angular/common/http';
import { map, Observable, ReplaySubject, switchMap, take, tap, of } from 'rxjs';
import { Shortcut } from 'app/layout/common/shortcuts/shortcuts.types';

@Injectable({
    providedIn: 'root'
})
export class ShortcutsService {
    private _shortcuts: ReplaySubject<Shortcut[]> = new ReplaySubject<Shortcut[]>(1);

    /**
     * Constructor
     */
    constructor(private _httpClient: HttpClient) {
    }

    // -----------------------------------------------------------------------------------------------------
    // @ Accessors
    // -----------------------------------------------------------------------------------------------------

    /**
     * Getter for shortcuts
     */
    get shortcuts$(): Observable<Shortcut[]> {
        return this._shortcuts.asObservable();
    }

    // -----------------------------------------------------------------------------------------------------
    // @ Private methods
    // -----------------------------------------------------------------------------------------------------

    private _loadFromLocalStorage(): Shortcut[] {
        const data = localStorage.getItem('ai_shortcuts');
        if (data) {
            try {
                return JSON.parse(data);
            } catch (e) {
                // Return default if error
            }
        }
        return [
            {
                id: '2496f42e-2f25-4e34-83d5-3ff9568fd984',
                label: 'Viết bài',
                description: 'Công cụ giúp bạn viết bài nhanh, chính xác & mượt mà hơn',
                icon: 'feather:book',
                link: '/archives',
                useRouter: true
            },
            {
                id: '56a0a561-17e7-40b3-bd75-0b6cef230b7e',
                label: 'Từ điển',
                description: 'Tra cứu & giải nghĩa các từ tiếng Việt phục vụ cho Văn bản',
                icon: 'feather:type',
                link: '/synonym',
                useRouter: true
            }
        ];
    }

    // -----------------------------------------------------------------------------------------------------
    // @ Public methods
    // -----------------------------------------------------------------------------------------------------

    /**
     * Get all messages
     */
    getAll(): Observable<Shortcut[]> {
        const shortcuts = this._loadFromLocalStorage();
        this._shortcuts.next(shortcuts);
        return of(shortcuts);
    }

    /**
     * Create a shortcut
     *
     * @param shortcut
     */
    create(shortcut: Shortcut): Observable<Shortcut> {
        return this.shortcuts$.pipe(
            take(1),
            map(shortcuts => {
                const newShortcut = { ...shortcut, id: Math.random().toString(36).substring(2, 15) };
                const updated = [...shortcuts, newShortcut];
                localStorage.setItem('ai_shortcuts', JSON.stringify(updated));
                this._shortcuts.next(updated);
                return newShortcut;
            })
        );
    }

    /**
     * Update the shortcut
     *
     * @param id
     * @param shortcut
     */
    update(id: string, shortcut: Shortcut): Observable<Shortcut> {
        return this.shortcuts$.pipe(
            take(1),
            map(shortcuts => {
                const index = shortcuts.findIndex(item => item.id === id);
                if (index !== -1) {
                    shortcuts[index] = { ...shortcut, id };
                    localStorage.setItem('ai_shortcuts', JSON.stringify(shortcuts));
                    this._shortcuts.next(shortcuts);
                    return shortcuts[index];
                }
                return null;
            })
        );
    }

    /**
     * Delete the shortcut
     *
     * @param id
     */
    delete(id: string): Observable<boolean> {
        return this.shortcuts$.pipe(
            take(1),
            map(shortcuts => {
                const index = shortcuts.findIndex(item => item.id === id);
                if (index !== -1) {
                    shortcuts.splice(index, 1);
                    localStorage.setItem('ai_shortcuts', JSON.stringify(shortcuts));
                    this._shortcuts.next(shortcuts);
                    return true;
                }
                return false;
            })
        );
    }
}
