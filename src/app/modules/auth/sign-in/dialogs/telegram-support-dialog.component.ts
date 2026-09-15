import {
    Component,
    ViewEncapsulation,
    ChangeDetectionStrategy,
} from '@angular/core';
import { MatDialogRef } from '@angular/material/dialog';

@Component({
    selector: 'app-telegram-support-dialog',
    templateUrl: './telegram-support-dialog.component.html',
    encapsulation: ViewEncapsulation.None,
    changeDetection: ChangeDetectionStrategy.Eager,
    standalone: false,
})
export class TelegramSupportDialogComponent {
    telegramUrl: string = 'https://t.me/AITypeSupport_bot';

    constructor(
        public matDialogRef: MatDialogRef<TelegramSupportDialogComponent>,
    ) {}

    openTelegramExternal(): void {
        const electron = (window as any).electron;
        if (electron && typeof electron.openExternal === 'function') {
            electron.openExternal(this.telegramUrl);
        } else {
            window.open(this.telegramUrl, '_blank');
        }
    }

    close(): void {
        this.matDialogRef.close();
    }
}
