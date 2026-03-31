import { Injectable } from '@angular/core';
import { HttpClient } from '@angular/common/http';
import { map, Observable, ReplaySubject, tap } from 'rxjs';
import { User } from 'app/core/user/user.types';

@Injectable({
    providedIn: 'root'
})
export class UserService {
    private _user: ReplaySubject<User> = new ReplaySubject<User>(1);

    /**
     * Constructor
     */
    constructor(private _httpClient: HttpClient) {
    }

    // -----------------------------------------------------------------------------------------------------
    // @ Accessors
    // -----------------------------------------------------------------------------------------------------

    /**
     * Setter & getter for user
     *
     * @param value
     */
    set user(value: User) {
        // Store the value
        this._user.next(value);
    }

    get user$(): Observable<User> {
        return this._user.asObservable();
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
                this._user.next(response);
            })
        );
    }

    public permissionF(user: User) {
        let cn2 = 0, cn3 = 0;

        if (user.groups?.includes('nhóm-sử-dụng-ai-tạo-hình-ảnh-và-download') || user.groups?.includes('nhóm-thu-thập-dữ-liệu') || user.groups?.includes('nhóm-sử-dụng-chuyển-đổi-văn-bản-thành-giọng-nói') || user.groups?.includes('nhóm-sử-dụng-siêu-dữ-liệu')) {
            cn2++;
        }

        if (user.groups?.includes('nhóm-khách-hàng-đã-mua-chatbot') || user.groups?.includes('nhóm-sử-dụng-seo-và-báo-cáo') || user.groups?.includes('nhóm-lên-kịch-bản-comment-like') || user.groups?.includes('nhóm-sử-dụng-zms') || user.groups?.includes('nhóm-chạy-traffic-hàng-tháng')) {
            cn3++;
        }

        return { cn2, cn3 };
    }

    public permissionVideo(user: User): boolean {
        if (user.groups?.includes('nhóm-sử-dụng-chuyển-video-thành-bài-viết')) {
            return true;
        }

        return false;
    }

    public permissionVideoDownloader(user: User): boolean {
        if (user.groups?.includes('nhóm-download-video-từ-youtube-facebook')) {
            return true;
        }

        return false;
    }

    public permissionDreamina(user: User): boolean {
        if (user.groups?.includes('nhóm-sử-dụng-dreamina-ai')) {
            return true;
        }

        return false;
    }

    public permissionText2Voice(user: User): boolean {
        if (user.groups?.includes('nhóm-sử-dụng-chuyển-đổi-văn-bản-thành-giọng-nói')) {
            return true;
        }

        return false;
    }

    public permissionScriptCommentLike(user: User): boolean {
        if (user.groups?.includes('nhóm-lên-kịch-bản-comment-like')) {
            return true;
        }

        return false;
    }
}
