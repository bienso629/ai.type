import { ChangeDetectionStrategy, ChangeDetectorRef, Component, Input, OnDestroy, OnInit, ViewEncapsulation } from '@angular/core';
import { Router, RouterStateSnapshot } from '@angular/router';
import { BooleanInput } from '@angular/cdk/coercion';
import { Subject, takeUntil } from 'rxjs';
import { User } from 'app/core/user/user.types';
import { UserService } from 'app/core/user/user.service';
import { MultiAccountService } from 'app/modules/_services/multi-account.service';

@Component({
    selector: 'user',
    templateUrl: './user.component.html',
    encapsulation: ViewEncapsulation.None,
    changeDetection: ChangeDetectionStrategy.OnPush,
    exportAs: 'user'
})
export class UserComponent implements OnInit, OnDestroy {
    /* eslint-disable @typescript-eslint/naming-convention */
    static ngAcceptInputType_showAvatar: BooleanInput;
    /* eslint-enable @typescript-eslint/naming-convention */

    @Input() showAvatar: boolean = true;
    user: User;

    isAiAgentEnabled: boolean = false;

    private _unsubscribeAll: Subject<any> = new Subject<any>();

    goto(page?: string) {
        this._router.navigateByUrl('settings');
    }

    async onSelectAccount(accountId: string) {
        const success = await this.multiAccountService.switchAccount(accountId);
        if (success) {
            // Ép tải lại trang để mọi Service, Interceptor, Component đều reset với data mới
            window.location.reload();
        }
    }

    /**
     * Constructor
     */
    constructor(
        private _changeDetectorRef: ChangeDetectorRef,
        private _router: Router,
        private _userService: UserService,
        private multiAccountService: MultiAccountService
    ) {
    }

    // -----------------------------------------------------------------------------------------------------
    // @ Lifecycle hooks
    // -----------------------------------------------------------------------------------------------------

    /**
     * On init
     */
    ngOnInit(): void {
        // Subscribe to user changes
        this._userService.user$
            .pipe(takeUntil(this._unsubscribeAll))
            .subscribe((user: User) => {
                if (user) {
                    this.user = user;

                    // Mark for check
                    this._changeDetectorRef.markForCheck();
                } else {
                    this._router.navigateByUrl('sign-out');
                }
            });

        this.multiAccountService.activeAccount$
            .pipe(takeUntil(this._unsubscribeAll))
            .subscribe(async sessionData => {
                let isAiAgentActive = false;
                if (sessionData && sessionData.settings) {
                    isAiAgentActive = sessionData.settings.enableAiAgent === true;
                }
                if ((window as any).electronAPI && (window as any).electronAPI.getPluginsStatus) {
                    try {
                        const list = await (window as any).electronAPI.getPluginsStatus();
                        const aiAgent = list?.find((p: any) => p.id === 'ai_agent');
                        if (aiAgent && aiAgent.enabled !== undefined) {
                            isAiAgentActive = aiAgent.enabled;
                        }
                    } catch(e) {}
                }
                this.isAiAgentEnabled = isAiAgentActive;
                this._changeDetectorRef.markForCheck();
            });
    }

    /**
     * On destroy
     */
    ngOnDestroy(): void {
        // Unsubscribe from all subscriptions
        this._unsubscribeAll.next(null);
        this._unsubscribeAll.complete();
    }

    // -----------------------------------------------------------------------------------------------------
    // @ Public methods
    // -----------------------------------------------------------------------------------------------------

    /**
     * Update the user status
     *
     * @param status
     */
    updateUserStatus(status: string): void {
        // Return if user is not available
        if (!this.user) {
            return;
        }

        // Update the user
        this._userService.update({
            ...this.user,
            status
        }).subscribe();
    }

    /**
     * Sign out
     */
    signOut(): void {
        this._router.navigate(['/sign-out']);
    }
}
