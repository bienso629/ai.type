import { ChangeDetectionStrategy, ChangeDetectorRef, Component, Inject, OnDestroy, OnInit, ViewEncapsulation } from '@angular/core';
import { UntypedFormBuilder, UntypedFormGroup, Validators } from '@angular/forms';
import { MAT_DIALOG_DATA } from '@angular/material/dialog';
import { Subject } from 'rxjs';

@Component({
  selector: 'settings-domain-login',
  templateUrl: './login.component.html',
  encapsulation: ViewEncapsulation.None,
  changeDetection: ChangeDetectionStrategy.OnPush
})
export class SettingsDomainLoginComponent implements OnInit, OnDestroy {
  loginForm: UntypedFormGroup;
  /* END TWO OBJECTS */
  cleanDomain(domain: string): string {
    if (!domain) return '';
    return domain.replace(/^https?:\/\//i, '');
  }

  private _unsubscribeAll: Subject<any> = new Subject<any>();

  /**
     * Sign in
     */
  signIn(): void {
    // Return if the form is invalid
    if (this.loginForm.invalid) {
      return;
    } else {
      console.log('value', this.loginForm.value);
    }
  }

  /**
   * Constructor
   */
  constructor(
    private cd: ChangeDetectorRef,
    private _formBuilder: UntypedFormBuilder,
    @Inject(MAT_DIALOG_DATA) public data: { domain: string }
  ) {
  }

  // -----------------------------------------------------------------------------------------------------
  // @ Lifecycle hooks
  // -----------------------------------------------------------------------------------------------------

  /**
   * On init
   */
  ngOnInit(): void {
    // Create the form
    this.loginForm = this._formBuilder.group({
      username: ['', Validators.required],
      apppass: ['', Validators.required]
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
}
