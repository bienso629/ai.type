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

import { isAutoSaveLocalEnabled } from 'app/_services/user-settings.service';

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

    private filterTasksListByMonth(list: any[], targetYear?: number, targetMonth?: number): any[] {
        if (!Array.isArray(list) || (!targetYear && !targetMonth)) {
            return list;
        }
        return list.filter((t: any) => {
            if (!t) return false;
            if (t.startDate) {
                const dt = new Date(t.startDate);
                if (!isNaN(dt.getTime())) {
                    if (targetYear && dt.getFullYear() !== targetYear) return false;
                    if (targetMonth && (dt.getMonth() + 1) !== targetMonth) return false;
                    return true;
                }
            }
            if (targetYear && t.year && Number(t.year) !== targetYear) return false;
            if (targetMonth && t.month && Number(t.month) !== targetMonth) return false;
            return true;
        });
    }

    public fetch(dataForm: any): Observable<any> {
        const isAutoSaveLocal = isAutoSaveLocalEnabled();
        const electron = (window as any).electron;
        const requestedYear = Number(dataForm?.targetYear || dataForm?.year) || undefined;
        const requestedMonth = Number(dataForm?.month) || undefined;
        const onlySelectedMonth = !!dataForm?.onlySelectedMonth;

        if (isAutoSaveLocal) {
            if (electron && electron.listLocalTasks) {
                const localPayload = {
                    ...dataForm,
                    year: requestedYear,
                    targetYear: requestedYear,
                    month: requestedMonth
                };
                return from(electron.listLocalTasks(localPayload)).pipe(
                    map((result: any) => {
                        if (onlySelectedMonth && (requestedYear || requestedMonth) && result && typeof result === 'object') {
                            if (Array.isArray(result.data)) {
                                result.data = this.filterTasksListByMonth(result.data, requestedYear, requestedMonth);
                            }
                            if (Array.isArray(result.result)) {
                                result.result = this.filterTasksListByMonth(result.result, requestedYear, requestedMonth);
                            }
                        }
                        return result;
                    }),
                    catchError(this.handleError('listLocalTasks', { success: true, data: [], result: [] }))
                );
            }
            return of({ success: true, data: [], result: [] });
        }

        let activeInfo = this.multiAccountService.getItem('active_info'); if (!activeInfo) { return of(null); }
        activeInfo = AuthUtils._getActiveInfo(activeInfo); if (!activeInfo) return of(null);

        const requestPayload: any = {
            ...dataForm,
            year: 2023,
            appId: 'ai.typing',
            appToken: activeInfo['user']['appToken']
        };
        if (requestedYear) {
            requestPayload.targetYear = requestedYear;
        }
        if (requestedMonth) {
            requestPayload.month = requestedMonth;
        }

        const url = `${this.config.settings.api[this.user.server]}/tasks/all`;

        let data = {
            params: this._h.encrypt(requestPayload, this.config.settings.gen)
        };

        return this.http.post<any>(url, data, options).pipe(
            map(res => {
                if (onlySelectedMonth && (requestedYear || requestedMonth)) {
                    if (Array.isArray(res)) {
                        return this.filterTasksListByMonth(res, requestedYear, requestedMonth);
                    }
                    if (res && typeof res === 'object') {
                        const cloned = { ...res };
                        if (Array.isArray(cloned.data)) {
                            cloned.data = this.filterTasksListByMonth(cloned.data, requestedYear, requestedMonth);
                        }
                        if (Array.isArray(cloned.result)) {
                            cloned.result = this.filterTasksListByMonth(cloned.result, requestedYear, requestedMonth);
                        }
                        return cloned;
                    }
                }
                return res;
            }),
            catchError(this.handleError('server', []))
        );
    }

    public add(dataForm: any): Observable<any> {
        const isAutoSaveLocal = isAutoSaveLocalEnabled();
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
        const isAutoSaveLocal = isAutoSaveLocalEnabled();
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
        const isAutoSaveLocal = isAutoSaveLocalEnabled();
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
