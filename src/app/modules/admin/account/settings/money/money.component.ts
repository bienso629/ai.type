import { ChangeDetectionStrategy, Component, OnInit, ViewEncapsulation } from '@angular/core';
import { UntypedFormBuilder, UntypedFormGroup } from '@angular/forms';
import { Title } from '@angular/platform-browser';

@Component({
    selector: 'settings-money',
    templateUrl: './money.component.html',
    encapsulation: ViewEncapsulation.None,
    changeDetection: ChangeDetectionStrategy.OnPush
})
export class SettingsMoneyComponent implements OnInit {
    planBillingForm: UntypedFormGroup;
    plans: any[];

    options = {
        align: "left",
        allowNegative: true,
        allowZero: false,
        decimal: ",",
        precision: 0,
        prefix: "",
        suffix: "",
        thousands: ".",
        nullable: false,
        min: 25000,
        max: 10000000,
    };

    /**
     * Save
     */
    save(): void {
        // Return if the form is invalid
        if (this.planBillingForm.invalid) {
            return;
        } else {
            console.log('value', this.planBillingForm.value);
        }
    }

    /**
     * Constructor
     */
    constructor(
        private titleService: Title,
        private _formBuilder: UntypedFormBuilder
    ) {
        this.titleService.setTitle(`link nhận tiền | ai.type - công cụ tạo content`);
    }

    // -----------------------------------------------------------------------------------------------------
    // @ Lifecycle hooks
    // -----------------------------------------------------------------------------------------------------

    /**
     * On init
     */
    ngOnInit(): void {
        // Create the form
        this.planBillingForm = this._formBuilder.group({
            // plan: ['team'],
            amountCtrl: ['', ],
            // cardNumber: [''],
            // cardExpiration: [''],
            // cardCVC: [''],
            // country: ['vietnam'],
            // zip: ['']
        });

        // Setup the plans
        this.plans = [
            {
                value: 'basic',
                label: 'Cơ bản',
                details: 'Bắt đầu trải nghiệm bằng gói cơ bản.',
                price: '230000'
            },
            {
                value: 'team',
                label: 'Chuyên cần',
                details: 'Viết bài đăng website chuẩn mực hơn.',
                price: '450000'
            },
            {
                value: 'enterprise',
                label: 'Cao cấp',
                details: 'Cao nhất trong công việc viết bài.',
                price: '950000'
            }
        ];
    }

    // -----------------------------------------------------------------------------------------------------
    // @ Public methods
    // -----------------------------------------------------------------------------------------------------

    /**
     * Track by function for ngFor loops
     *
     * @param index
     * @param item
     */
    trackByFn(index: number, item: any): any {
        return item.id || index;
    }
}
