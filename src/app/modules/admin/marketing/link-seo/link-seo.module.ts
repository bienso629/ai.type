import { Component, Inject, NgModule } from '@angular/core';
import { Route, RouterModule } from '@angular/router';
import { MatButtonModule } from '@angular/material/button';
import { MatButtonToggleModule } from '@angular/material/button-toggle';
import { MatFormFieldModule } from '@angular/material/form-field';
import { MatIconModule } from '@angular/material/icon';
import { MatInputModule } from '@angular/material/input';
import { MatMenuModule } from '@angular/material/menu';
import { MatSelectModule } from '@angular/material/select';
import { MatSidenavModule } from '@angular/material/sidenav';
import { MAT_DIALOG_DATA, MatDialogModule, MatDialogRef } from '@angular/material/dialog';
import { MatSortModule } from '@angular/material/sort';
import { MatTableModule } from '@angular/material/table';
import { MatTooltipModule } from '@angular/material/tooltip';
import { MatExpansionModule } from '@angular/material/expansion';
import { TimeagoModule } from 'ngx-timeago';
import { NgSelectModule } from '@ng-select/ng-select';
import { SharedModule } from 'app/shared.module';
// import { LinksResolver } from 'app/modules/admin/link-seo/link-seo.resolvers';
import { LinksComponent } from 'app/modules/admin/marketing/link-seo/link-seo.component';
import { EditDialog } from 'app/modules/admin/marketing/link-seo/dialogs/edit-dialog';

@Component({
    selector: 'app-dialog-content',
    template: `<div class="text-xl font-normal text-gray-500 tracking-tight flex items-stretch">
        <mat-icon class="self-center mr-2 icon-size-5" [svgIcon]="'feather:twitch'"></mat-icon>
        <mat-label class="self-center">Kết quả đánh giá SEO của {{data.link}}</mat-label>
    </div>

    <div mat-dialog-content class="mt-4 p-0 ket-qua-seo" [innerHTML]="data.html"></div>

    <div mat-dialog-actions class="p-0 mt-4">
        <button mat-flat-button color="medium" (click)="close()" class="ml-0">Đóng cửa sổ</button>
    </div>`
})

export class DialogContentComponent {
    constructor(public dialogRef: MatDialogRef<DialogContentComponent>, @Inject(MAT_DIALOG_DATA) public data: { html: string, link: string }) { }

    close() {
        this.dialogRef.close();
    }
}

const logsRoutes: Route[] = [
    {
        path: '',
        component: LinksComponent,
        // resolve  : {
        //     data: LinksResolver
        // }
    }
];

@NgModule({
    declarations: [
        LinksComponent,
        DialogContentComponent,
        EditDialog
    ],
    imports: [
        MatButtonModule,
        MatButtonToggleModule,
        MatFormFieldModule,
        MatIconModule,
        MatInputModule,
        MatDialogModule,
        MatMenuModule,
        MatSelectModule,
        MatSidenavModule,
        MatSortModule,
        MatTableModule,
        MatTooltipModule,
        MatExpansionModule,
        NgSelectModule,
        RouterModule.forChild(logsRoutes),
        TimeagoModule.forRoot(),
        SharedModule,
    ],
    exports: [EditDialog]
})
export class LinksModule {
}
