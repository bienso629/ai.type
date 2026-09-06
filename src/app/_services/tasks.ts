import { HttpClient, HttpHeaders } from '@angular/common/http';
import { Injectable } from '@angular/core';
import { FuseConfigService } from '@fuse/services/config';
import { AuthUtils } from 'app/core/auth/auth.utils';
import { AppConfig } from 'app/core/config/app.config';
import { UserService } from 'app/core/user/user.service';
import { User } from 'app/core/user/user.types';
import { HelperService } from 'app/helper.service';

import { Observable, Subject, of, from } from 'rxjs';
import { catchError, tap, map, takeUntil } from 'rxjs/operators';
import { MultiAccountService } from './multi-account.service';

let options = {
    headers: new HttpHeaders({
        'content-type': 'application/json',
    })
};

@Injectable()
export class TasksService {
    year: number = 2023;
    config: AppConfig;
    user: User;
    private _unsubscribeAll: Subject<any> = new Subject<any>();

    constructor(
        private http: HttpClient,
        private _h: HelperService,
        private _userService: UserService,
        private _fuseConfigService: FuseConfigService,
        private multiAccountService: MultiAccountService
    ) {
        // Subscribe to user changes
        this._userService.user$
            .pipe(takeUntil(this._unsubscribeAll))
            .subscribe((user: User) => {
                this.user = user;
            });

        // Subscribe to config changes
        this._fuseConfigService.config$
            .pipe(takeUntil(this._unsubscribeAll))
            .subscribe((config: AppConfig) => {
                // Store the config
                this.config = config;
            });
    }

    public fetch(dataForm: any): Observable<any> {
        const isAutoSaveLocal = localStorage.getItem('ai_type_auto_save_local') !== 'false';
        const electron = (window as any).electron;

        if (isAutoSaveLocal) {
            if (electron && electron.listLocalTasks) {
                return from(electron.listLocalTasks(dataForm)).pipe(
                    map((result: any) => result),
                    catchError(this.handleError('listLocalTasks', { success: true, data: [], result: [] }))
                );
            }
            return of({ success: true, data: [], result: [] });
        }

        let activeInfo = this.multiAccountService.getItem('active_info'); if (!activeInfo) { return of(null); }
        activeInfo = AuthUtils._getActiveInfo(activeInfo); if (!activeInfo) return of(null);

        dataForm.year = 2023;
        dataForm.appId = 'ai.typing';
        dataForm.appToken = activeInfo['user']['appToken'];

        const url = `${this.config.settings.api[this.user.server]}/tasks/all`;

        let data = {
            params: this._h.encrypt(dataForm, this.config.settings.gen)
        };

        return this.http.post<any>(url, data, options).pipe(
            map(data => {
                return data;
            }),
            catchError(this.handleError('server', []))
        );
    }

    public add(dataForm: any): Observable<any> {
        const isAutoSaveLocal = localStorage.getItem('ai_type_auto_save_local') !== 'false';
        const electron = (window as any).electron;

        if (isAutoSaveLocal) {
            if (electron && electron.saveLocalTask) {
                return from(electron.saveLocalTask(dataForm)).pipe(
                    map((result: any) => result),
                    catchError(this.handleError('saveLocalTask', { success: false }))
                );
            }
            const task = dataForm?.task || dataForm;
            const id = task._id || task.id || ('local_task_' + Date.now());
            return of({ success: true, id: id, _id: id, message: 'Đã lưu task cục bộ' });
        }

        let activeInfo = this.multiAccountService.getItem('active_info'); if (!activeInfo) {return of(null);}
        activeInfo = AuthUtils._getActiveInfo(activeInfo); if (!activeInfo) return of(null);

        dataForm.year = 2023;
        dataForm.appId = 'ai.typing';
        dataForm.appToken = activeInfo['user']['appToken'];

        const url = `${this.config.settings.api[this.user.server]}/tasks/add`;

        let data = {
            params: this._h.encrypt(dataForm, this.config.settings.gen)
        };

        return this.http.post<any>(url, data, options).pipe(
            map(data => {
                return data;
            }),
            catchError(this.handleError('server', []))
        );
    }

    public edit(dataForm: any): Observable<any> {
        const isAutoSaveLocal = localStorage.getItem('ai_type_auto_save_local') !== 'false';
        const electron = (window as any).electron;

        if (isAutoSaveLocal) {
            if (electron && electron.saveLocalTask) {
                return from(electron.saveLocalTask(dataForm)).pipe(
                    map((result: any) => result),
                    catchError(this.handleError('saveLocalTask', { success: false }))
                );
            }
            const task = dataForm?.task || dataForm;
            const id = task._id || task.id || ('local_task_' + Date.now());
            return of({ success: true, id: id, _id: id, message: 'Đã cập nhật task cục bộ' });
        }

        let activeInfo = this.multiAccountService.getItem('active_info'); if (!activeInfo) {return of(null);}
        activeInfo = AuthUtils._getActiveInfo(activeInfo); if (!activeInfo) return of(null);

        dataForm.year = 2023;
        dataForm.appId = 'ai.typing';
        dataForm.appToken = activeInfo['user']['appToken'];
        
        const url = `${this.config.settings.api[this.user.server]}/tasks/edit`;

        let data = {
            params: this._h.encrypt(dataForm, this.config.settings.gen)
        };

        return this.http.post<any>(url, data, options).pipe(
            map(data => {
                return data;
            }),
            catchError(this.handleError('server', []))
        );
    }

    public delete(dataForm: any): Observable<any> {
        const isAutoSaveLocal = localStorage.getItem('ai_type_auto_save_local') !== 'false';
        const electron = (window as any).electron;

        if (isAutoSaveLocal) {
            if (electron && electron.deleteLocalTask) {
                return from(electron.deleteLocalTask(dataForm)).pipe(
                    map((result: any) => result),
                    catchError(this.handleError('deleteLocalTask', { success: false }))
                );
            }
            return of({ success: true, message: 'Đã xóa task cục bộ' });
        }

        let activeInfo = this.multiAccountService.getItem('active_info'); if (!activeInfo) {return of(null);}
        activeInfo = AuthUtils._getActiveInfo(activeInfo); if (!activeInfo) return of(null);

        dataForm.year = 2023;
        dataForm.appId = 'ai.typing';
        dataForm.appToken = activeInfo['user']['appToken'];
        
        const url = `${this.config.settings.api[this.user.server]}/tasks/delete`;

        let data = {
            params: this._h.encrypt(dataForm, this.config.settings.gen)
        };

        return this.http.post<any>(url, data, options).pipe(
            map(data => {
                return data;
            }),
            catchError(this.handleError('server', []))
        );
    }

    // tslint:disable-next-line: typedef
    private handleError<T>(operation = 'operation', result?: T) {
        return (error: any): Observable<T> => {
            console.error(error); 
            this.log(`${operation} failed: ${error.message}`);
            return of(result as T);
        };
    }

    private log(message: string) {
        console.log(message);
    }
}
