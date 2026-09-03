import { Component, OnDestroy, OnInit, ViewChild, ViewEncapsulation } from '@angular/core';
import { UntypedFormBuilder, UntypedFormGroup, NgForm, Validators } from '@angular/forms';
import { ActivatedRoute, Router } from '@angular/router';
import { fuseAnimations } from '@fuse/animations';
import { FuseAlertType } from '@fuse/components/alert';
import { AuthService } from 'app/core/auth/auth.service';
import { MultiAccountService } from 'app/_services/multi-account.service';
import { UserService } from 'app/core/user/user.service';
import { UserClientService } from 'app/_services/user';
import { ForumService } from 'app/_services/forum';
import { AuthUtils } from 'app/core/auth/auth.utils';
import { Subject, takeUntil } from 'rxjs';
import { User } from 'app/core/user/user.types';

@Component({
    selector: 'auth-sign-up',
    templateUrl: './sign-up.component.html',
    encapsulation: ViewEncapsulation.None,
    animations: fuseAnimations
})
export class AuthSignUpComponent implements OnInit, OnDestroy {
    @ViewChild('signUpNgForm') signUpNgForm: NgForm;

    accounts = [];
    alert: { type: FuseAlertType; message: string } = {
        type: 'success',
        message: ''
    };
    signUpForm: UntypedFormGroup;
    showAlert: boolean = false;

    private _unsubscribeAll: Subject<any> = new Subject<any>();

    /**
     * Constructor
     */
    constructor(
        private _activatedRoute: ActivatedRoute,
        private _authService: AuthService,
        private _formBuilder: UntypedFormBuilder,
        private _router: Router,
        private _userService: UserService,
        private _userClientService: UserClientService,
        private _forumService: ForumService,
        private multiAccountService: MultiAccountService
    ) {
    }
    
    ngOnDestroy(): void {
        this._unsubscribeAll.next(null);
        this._unsubscribeAll.complete();
    }

    // -----------------------------------------------------------------------------------------------------
    // @ Lifecycle hooks
    // -----------------------------------------------------------------------------------------------------

    /**
     * On init
     */
    ngOnInit(): void {
        // Create the form
        this.signUpForm = this._formBuilder.group({
            name: ['', Validators.required],
            email: ['', [Validators.required, Validators.email]],
            password: ['', Validators.required],
            company: [''],
            agreements: ['', Validators.requiredTrue]
        });

        this.multiAccountService.getAllAccounts().then(accounts => {
            if (accounts && accounts.length > 0) {
                this.accounts = accounts.map((acc: any) => {
                    if (acc.profile && acc.profile.avatar) {
                        acc.profile.avatar = acc.profile.avatar.replace(/&#x2F;/gi, '/');
                    }
                    return acc;
                });
            }
        });
    }

    // -----------------------------------------------------------------------------------------------------
    // @ Public methods
    // -----------------------------------------------------------------------------------------------------

    async onSelectAccount(accountId: string, index: number) {
        const success = await this.multiAccountService.switchAccount(accountId);
        if (success) {
            const user = this.accounts[index]['profile'];
            if (user) {
                this.checkAccount(user);
            }
        }
    }

    save(user: User): void {
        this._userClientService
            .updateProfile({
                profile: {},
                username: user.name,
            })
            .pipe(takeUntil(this._unsubscribeAll))
            .subscribe({
                next: async (_) => { },
                error: () => { },
                complete: () => { },
            });
    }

    checkAccount(user: any) {
        this._forumService
            .getGroups('vn.s3')
            .subscribe((result) => {
                if (result && result.success && result.data) {
                    result.data.groups.map((g: any) => {
                        if (g.slug === 'nhóm-đã-mua-ai-type') {
                            this.multiAccountService.setItem('members', g.members);
                        }

                        g.members.map((m: any) => {
                            if (m.uid === user.id) {
                                if (
                                    !user.groups?.includes(
                                        g.slug,
                                    )
                                ) {
                                    user.groups.push(g.slug);
                                }
                            }
                        });
                    });

                    // Store the access token in the local storage
                    this._authService.accessToken = AuthUtils._generateJWTToken(user);

                    // Store the user on the user service
                    this._userService.user = user;

                    const redirectURL =
                        this._activatedRoute.snapshot.queryParamMap.get(
                            'redirectURL',
                        ) || '/signed-in-redirect';
                    this._router.navigateByUrl(redirectURL);
                } else {
                    this.alert = {
                        type: 'warning',
                        message: 'Tài khoản của bạn không đúng.',
                    };
                }
            });
    }

    /**
     * Sign up
     */
    signUp(): void {
        // Do nothing if the form is invalid
        if (this.signUpForm.invalid) {
            return;
        }

        // Disable the form
        this.signUpForm.disable();

        // Hide the alert
        this.showAlert = false;

        // Sign up
        this._authService.signUp(this.signUpForm.value)
            .subscribe(
                (response) => {

                    // Navigate to the confirmation required page
                    this._router.navigateByUrl('/confirmation-required');
                },
                (response) => {

                    // Re-enable the form
                    this.signUpForm.enable();

                    // Reset the form
                    this.signUpNgForm.resetForm();

                    // Set the alert
                    this.alert = {
                        type: 'error',
                        message: 'Something went wrong, please try again.'
                    };

                    // Show the alert
                    this.showAlert = true;
                }
            );
    }
}
