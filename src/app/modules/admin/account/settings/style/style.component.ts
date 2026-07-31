import { ChangeDetectionStrategy, ChangeDetectorRef, Component, OnInit, ViewEncapsulation } from '@angular/core';
import { Title } from '@angular/platform-browser';
import { AddStyleDialog } from './dialogs/add-dialog';
import { MatDialog } from '@angular/material/dialog';
import { UserClientService } from 'app/_services/user';
import { Subject, takeUntil } from 'rxjs';
import { User } from 'app/core/user/user.types';
import { UserService } from 'app/core/user/user.service';
import { ToastrService } from 'ngx-toastr';
import { MultiAccountService } from 'app/_services/multi-account.service';

@Component({
    selector: 'settings-style',
    templateUrl: './style.component.html',
    providers: [UserClientService],
    encapsulation: ViewEncapsulation.None,
    changeDetection: ChangeDetectionStrategy.OnPush
})
export class SettingsStyleComponent implements OnInit {
    user: User;

    styles = [];
    private _unsubscribeAll: Subject<any> = new Subject<any>();

    add() {
        const dialogRef = this.dialog.open(AddStyleDialog, {
            width: '540px',
            data: {
                styles: this.styles,
                index: -1
            }
        });

        dialogRef.afterClosed().subscribe(result => {
            if (result) {
                let styles: any = this.multiAccountService.getItem('styles') || [];
                this.styles = styles;
                this.cd.markForCheck();
            }
        });
    }

    delete(i: number) {
        this.styles.splice(i, 1);
        this.update();
    }

    edit(i: number) {
        const dialogRef = this.dialog.open(AddStyleDialog, {
            width: '540px',
            data: {
                styles: this.styles,
                index: i
            }
        });

        dialogRef.afterClosed().subscribe(result => {
            if (result) {
                let styles: any = this.multiAccountService.getItem('styles') || [];
                this.styles = styles;
                this.cd.markForCheck();
            }
        });
    }

    update() {
        this._userClientService.updateProfile({
            profile: {
                styles: this.styles,
            },
            username: this.user.name
        })
            .pipe(takeUntil(this._unsubscribeAll))
            .subscribe({
                next: async (result) => {
                    if (result && result.success && result.data) {
                        this.multiAccountService.setItem('styles', this.styles);
                        this.toastr.success(`Đồng bộ phong cách xong!`);

                    } else {
                        this.toastr.error(`Không thể đồng bô phong cách.`);
                    }
                },
                error: () => {
                },
                complete: () => {
                }
            });
    }

    /**
     * Constructor
     */
    constructor(
        private titleService: Title,
        public dialog: MatDialog,
        private _userService: UserService,
        private _userClientService: UserClientService,
        private toastr: ToastrService,
        private cd: ChangeDetectorRef,
        private multiAccountService: MultiAccountService
    ) {
        this.titleService.setTitle(`tạo phong cách viết | ai.type - công cụ tạo content`);
    }

    // -----------------------------------------------------------------------------------------------------
    // @ Lifecycle hooks
    // -----------------------------------------------------------------------------------------------------

    /**
     * On init
     */
    ngOnInit(): void {
        let styles: any = this.multiAccountService.getItem('styles') || [];
        this.styles = styles;

        this._userService.user$
            .pipe(takeUntil(this._unsubscribeAll))
            .subscribe((user: User) => {
                this.user = user;
            });
    }

    ngOnDestroy(): void {
        this._unsubscribeAll.next(null);
        this._unsubscribeAll.complete();
    }
}
