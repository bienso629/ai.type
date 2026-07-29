import { AfterContentChecked, ChangeDetectionStrategy, ChangeDetectorRef, Component, Inject, OnDestroy, OnInit, ViewEncapsulation } from '@angular/core';
import { FormControl, FormGroup, Validators } from '@angular/forms';
import { CrawlService } from 'app/_services/crawl';
import { UserService } from 'app/core/user/user.service';
import { ToastrService } from 'ngx-toastr';
import { User } from 'app/core/user/user.types';
import { Subject, takeUntil } from 'rxjs';
import { MAT_DIALOG_DATA, MatDialogRef } from '@angular/material/dialog';
import { UserClientService } from 'app/_services/user';

@Component({
    selector: 'payment',
    styleUrls: ['./payment.component.scss'],
    templateUrl: './payment.component.html',
    providers: [CrawlService, UserClientService],
    changeDetection: ChangeDetectionStrategy.OnPush,
    encapsulation: ViewEncapsulation.None
})
export class PaymentComponent implements OnInit, OnDestroy, AfterContentChecked {
    uuid: string;
    receiver: string;
    user: User;
    linkDonate: string;

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
        min: 0,
        max: 10000000
    };

    paymentForm = new FormGroup({
        amountCtrl: new FormControl(null, [Validators.required, Validators.min(25000), Validators.max(10000000)]),
        noteCtrl: new FormControl('', Validators.required)
    });

    private _unsubscribeAll: Subject<any> = new Subject<any>();

    send() {
        if (!this.paymentForm.valid) {
            this.toastr.warning(`Không thể mua cafe vào lúc này.`);
        } else {
            let data = {
                uuid: this.uuid,
                amount: this.paymentForm.value.amountCtrl,
                currency: 'VND',
                username: this.user.name,
                receiver: this.receiver,
                note: this.paymentForm.value.noteCtrl
            };

            this._crawlService.archivePayment(data)
                .pipe(takeUntil(this._unsubscribeAll))
                .subscribe({
                    error: () => {
                    },
                    complete: () => {
                        this.toastr.success(`Mua 1 ly cafe thành công!`);
                        this.close();
                    }
                });
        }
    }

    close() {
        this.dialogRef.close();
    }

    /**
     * Constructor
     */
    constructor(
        private toastr: ToastrService,
        private _userService: UserService,
        private _crawlService: CrawlService,
        private cd: ChangeDetectorRef,
        public dialogRef: MatDialogRef<PaymentComponent>,
        @Inject(MAT_DIALOG_DATA) public data: PaymentComponent
    ) {
        this.uuid = data.uuid;
        this.receiver = data.receiver;
        this.linkDonate = data.linkDonate;
    }

    ngAfterContentChecked(): void {
        // lam moi lai giao dien
        this.cd.markForCheck();
    }

    ngOnInit() {
        this._userService.user$
            .pipe(takeUntil(this._unsubscribeAll))
            .subscribe((user: User) => {
                this.user = user;
            });
    }

    ngOnDestroy(): void {
        // Unsubscribe from all subscriptions
        this._unsubscribeAll.next(null);
        this._unsubscribeAll.complete();
    }
}
