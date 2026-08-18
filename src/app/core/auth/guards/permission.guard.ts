import { Injectable } from '@angular/core';
import { ActivatedRouteSnapshot, Router, RouterStateSnapshot } from '@angular/router';
import { Observable, of } from 'rxjs';
import { switchMap, take } from 'rxjs/operators';
import { MatSnackBar } from '@angular/material/snack-bar';
import { UserService } from 'app/core/user/user.service';

@Injectable({
    providedIn: 'root'
})
export class PermissionGuard {

    constructor(
        private _userService: UserService,
        private _router: Router,
        private _snackBar: MatSnackBar
    ) {}

    canActivate(route: ActivatedRouteSnapshot, _state: RouterStateSnapshot): Observable<boolean> {
        return this._check(route);
    }

    canActivateChild(route: ActivatedRouteSnapshot, _state: RouterStateSnapshot): Observable<boolean> {
        return this._check(route);
    }

    private _check(route: ActivatedRouteSnapshot): Observable<boolean> {
        const requiredGroup: string = route.data?.['requiredGroup'];

        // No group requirement — allow through
        if (!requiredGroup) {
            return of(true);
        }

        return this._userService.user$.pipe(
            take(1),
            switchMap((user) => {
                const hasPermission = user?.groups?.includes(requiredGroup);

                if (!hasPermission) {
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

                    // Redirect to tools page
                    this._router.navigate(['/tools']);
                    return of(false);
                }

                return of(true);
            })
        );
    }
}
