import { ChangeDetectionStrategy, Component, Inject, OnDestroy, OnInit, ViewEncapsulation } from '@angular/core';
import { UntypedFormBuilder, UntypedFormGroup, Validators } from '@angular/forms';
import { MAT_DIALOG_DATA } from '@angular/material/dialog';
import { LicenseKeyService } from 'app/modules/_services/licensekey';
import { License, Licensekey } from 'licensekey';
import { ToastrService } from 'ngx-toastr';
import { Subject, takeUntil } from 'rxjs';
import { User } from 'app/core/user/user.types';

import * as uuid from 'uuid';
import { MAT_DATE_FORMATS, MAT_DATE_LOCALE } from '@angular/material/core';

export const MY_DATE_FORMATS = {
	parse: {
		dateInput: 'YYYY/MM/DD',
	},
	display: {
		dateInput: 'DD/MM/YYYY',
		monthYearLabel: 'MMMM YYYY',
		dateA11yLabel: 'LL',
		monthYearA11yLabel: 'MMMM YYYY'
	},
};

@Component({
	selector: 'settings-licensekey-create',
	templateUrl: './create.component.html',
	encapsulation: ViewEncapsulation.None,
	providers: [
		LicenseKeyService,
		{ provide: MAT_DATE_FORMATS, useValue: MY_DATE_FORMATS },
		{ provide: MAT_DATE_LOCALE, useValue: 'vi' },
	],
	changeDetection: ChangeDetectionStrategy.OnPush
})
export class SettingsCreateLicenseKeyComponent implements OnInit, OnDestroy {
	title: String = 'Tạo License Key';
	icon: String = 'feather:key';

	user: User;
	createForm: UntypedFormGroup;
	licenseInfo: any;
	isCreating: boolean = false;

	/* END TWO OBJECTS */
	private _unsubscribeAll: Subject<any> = new Subject<any>();

	public licensekey() {
		if (this.data.type === 'extend') return;
		this.licenseInfo = {
			info: {
				customerName: this.createForm.value['customerName'],
				address: this.createForm.value['address'],
				phoneNumber: this.createForm.value['phoneNumber'],
				email: this.createForm.value['email'],
				createDate: this.createForm.value['createDate']
			},
			expirationDate: this.createForm.value['expirationDate'],
			reputationScore: this.createForm.value['reputationScore'],
			appId: this.createForm.value['appId'],
			appToken: this.createForm.value['appToken'],
			appVersion: this.createForm.value['appVersion']
		};

		const info = new License(this.licenseInfo);
		const serial = this.license.createLicense(info);

		this.createForm.controls['licenseKey'].setValue(serial);
		this.licenseInfo['licenseKey'] = serial;
	}

	/**
	   * Tạo License Key
	   */
	submit(): void {
		// Return if the form is invalid
		if (this.createForm.invalid) {
			this.toastr.error(`Tạo License Key lỗi.`);
			return;
		} else {
			if (this.data.type === 'extend') {
				this.extend();
			} else {
				this.add();
			}
		}
	}

	add(): void {
		this.isCreating = true;
		this._licenseKeyService.add({
			username: this.user.name,
			licenseInfo: this.licenseInfo
		})
			.pipe(takeUntil(this._unsubscribeAll))
			.subscribe({
				next: async (result) => {
					if (result && result.success) {
						this.toastr.success(`Tạo License Key mới xong.`);
					} else {
						this.toastr.error(`Tạo License Key lỗi.`);
						this.toastr.warning(`Có thể License Key này đã tồn tại.`);
					}
				},
				error: () => {
					this.isCreating = false;
					this.toastr.error(`Tạo License Key lỗi.`);
				},
				complete: () => {
					this.isCreating = false;
				}
			});
	}

	extend(): void {
		this.isCreating = true;
		this._licenseKeyService.extend({
			username: this.user.name,
			licenseInfo: {
				info: {
					customerName: this.createForm.value['customerName'],
					address: this.createForm.value['address'],
					phoneNumber: this.createForm.value['phoneNumber'],
					email: this.createForm.value['email'],
					createDate: this.createForm.value['createDate']
				},
				expirationDate: this.createForm.value['expirationDate'],
				reputationScore: this.createForm.value['reputationScore'],
				appId: this.createForm.value['appId'],
				appToken: this.createForm.value['appToken'],
				appVersion: this.createForm.value['appVersion'],
				licenseKey: this.createForm.value['licenseKey']
			}
		})
			.pipe(takeUntil(this._unsubscribeAll))
			.subscribe({
				next: async (result) => {
					if (result && result.success) {
						this.toastr.success(`Gia hạn License Key thành công.`);
					} else {
						this.toastr.error(`Gia hạn License Key lỗi.`);
					}
				},
				error: () => {
					this.isCreating = false;
					this.toastr.error(`Gia hạn License Key lỗi.`);
				},
				complete: () => {
					this.isCreating = false;
				}
			});
	}

	/**
	 * Constructor
	 */
	constructor(
		private _formBuilder: UntypedFormBuilder,
		private license: Licensekey,
		private _licenseKeyService: LicenseKeyService,
		private toastr: ToastrService,
		@Inject(MAT_DIALOG_DATA) public data
	) {
		if (data.user) this.user = data.user;
		if (data.title) this.title = data.title;
		if (data.icon) this.icon = data.icon;

		// Create the form
		this.createForm = this._formBuilder.group({
			appId: [(data.item) ? data.item.appId : '', Validators.required],
			appVersion: [(data.item) ? data.item.appVersion : '', Validators.required],
			appToken: [(data.item && data.type === 'extend') ? data.item.appToken : uuid.v4(), Validators.required],
			customerName: [(data.item) ? data.item.info.customerName : '', Validators.required],
			address: [(data.item) ? data.item.info.address : ''],
			phoneNumber: [(data.item) ? data.item.info.phoneNumber : ''],
			email: [(data.item) ? data.item.info.email : ''],
			createDate: [new Date(), Validators.required],
			expirationDate: ['', Validators.required],
			reputationScore: [30, Validators.required],
			licenseKey: [(data.item && data.type === 'extend') ? data.item.licenseKey : '', Validators.required],
		});
	}

	// -----------------------------------------------------------------------------------------------------
	// @ Lifecycle hooks
	// -----------------------------------------------------------------------------------------------------

	/**
	  * On init
	  */
	ngOnInit(): void {
	}

	ngOnDestroy(): void {
		// Unsubscribe from all subscriptions
		this._unsubscribeAll.next(null);
		this._unsubscribeAll.complete();
	}
}
