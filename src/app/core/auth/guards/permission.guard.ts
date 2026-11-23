import { Injectable } from '@angular/core';
import { ActivatedRouteSnapshot, Router, RouterStateSnapshot } from '@angular/router';
import { Observable, of } from 'rxjs';
import { catchError, map, switchMap, take, timeout } from 'rxjs/operators';
import { MatSnackBar } from '@angular/material/snack-bar';
import { ToastrService } from 'ngx-toastr';
import { UserService } from 'app/core/user/user.service';
import { User } from 'app/core/user/user.types';
import { ForumService } from 'app/_services/forum';
import { MultiAccountService } from 'app/_services/multi-account.service';
import { AuthUtils } from 'app/core/auth/auth.utils';

@Injectable({
    providedIn: 'root'
})
export class PermissionGuard {

    constructor(
        private _userService: UserService,
        private _router: Router,
        private _snackBar: MatSnackBar,
        private _toastr: ToastrService,
        private _forumService: ForumService,
        private _multiAccountService: MultiAccountService
    ) {}

    canActivate(route: ActivatedRouteSnapshot, _state: RouterStateSnapshot): Observable<boolean> {
        return this._check(route);
    }

    canActivateChild(route: ActivatedRouteSnapshot, _state: RouterStateSnapshot): Observable<boolean> {
        return this._check(route);
    }

    private _check(route: ActivatedRouteSnapshot): Observable<boolean> {
        const requiredGroup: string = route.data?.['requiredGroup'];
        const allowAdmin: boolean = !!route.data?.['allowAdmin'];
        const deniedMessage: string = route.data?.['deniedMessage'];

        // No group/role requirement — allow through
        if (!requiredGroup && !allowAdmin) {
            return of(true);
        }

        const hasAccess = (u: User | null | undefined): boolean => {
            const groupOk = requiredGroup ? this._userService.hasGroup(u, requiredGroup) : false;
            const adminOk = allowAdmin ? this._userService.isAdmin(u) : false;
            return groupOk || adminOk;
        };

        const deny = (): boolean => {
            if (deniedMessage) {
                this._toastr.error(deniedMessage, '', {
                    timeOut: 4000,
                    positionClass: 'toast-top-center'
                });
            } else {
                // Show access denied notification
                this._snackBar.open(
                    '🔒 Ngăn truy cập — Bạn chưa có quyền sử dụng tính năng này.',
                    'Đóng',
                    {
                        duration: 5000,
                        horizontalPosition: 'center',
                        verticalPosition: 'top'
                    }
                );
            }

            // Nếu truy cập trực tiếp (chưa đứng ở màn hình hợp lệ nào) hoặc route không có deniedMessage riêng -> điều hướng về /tools
            const currentUrl = this._router.url || '';
            const isLandingDirectly = !currentUrl || currentUrl === '/' || currentUrl.startsWith('/profile') || currentUrl.startsWith('/signed-in-redirect');
            if (!deniedMessage || isLandingDirectly) {
                this._router.navigate(['/tools']);
            }
            return false;
        };

        const userSource$ = this._userService.user
            ? of(this._userService.user)
            : this._userService.user$.pipe(take(1));

        return userSource$.pipe(
            switchMap((user) => {
                if (hasAccess(user)) {
                    return of(true);
                }

                // Nếu chưa đồng bộ nhóm gần đây (ví dụ vừa được Admin thêm vào nhóm hoặc mới khôi phục phiên cũ), kiểm tra lại nhanh từ server
                if (user && !this._userService.isGroupsSyncedRecently(user)) {
                    const server = user.server || 'vn.s3';
                    return this._forumService.getGroups(server).pipe(
                        timeout(2500),
                        map((result) => {
                            this._userService.markGroupsSynced(user);
                            if (result && result.success && result.data && Array.isArray(result.data.groups) && result.data.groups.length > 0) {
                                const freshGroups = this._userService.extractGroupsFromForumResponse(user, result.data.groups);
                                const updatedUser: User = { ...user, groups: freshGroups };
                                this._userService.user = updatedUser;
                                this._multiAccountService.setItem('user', updatedUser);
                                this._multiAccountService.setItem('accessToken', AuthUtils._generateJWTToken(updatedUser));
                                // Nếu máy chủ xác nhận tài khoản không còn trong "nhóm-đã-mua-ai-type" -> đăng xuất ngay
                                if (
                                    this._userService.hasPurchasedGroupDefinition(result.data.groups) &&
                                    !this._userService.hasPurchasedGroup(updatedUser)
                                ) {
                                    this._userService.notifyPurchasedGroupRevoked(
                                        updatedUser,
                                        'Tài khoản của bạn không còn thuộc nhóm "nhóm-đã-mua-ai-type".',
                                    );
                                    return false;
                                }
                                return hasAccess(updatedUser) ? true : deny();
                            }
                            return deny();
                        }),
                        catchError(() => {
                            this._userService.markGroupsSynced(user);
                            return of(deny());
                        })
                    );
                }

                return of(deny());
            })
        );
    }
}
