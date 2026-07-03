import { TranslocoModule } from '@ngneat/transloco';
import { CUSTOM_ELEMENTS_SCHEMA, NgModule } from '@angular/core';
import { Route, RouterModule } from '@angular/router';
import { MatIconModule } from '@angular/material/icon';
import { MatGridListModule } from '@angular/material/grid-list';
import { MatButtonModule } from '@angular/material/button';
import { MatCheckboxModule } from '@angular/material/checkbox';
import { MatFormFieldModule } from '@angular/material/form-field';
import { MatSelectModule } from '@angular/material/select';
import { MatListModule } from '@angular/material/list';
import { MatExpansionModule } from '@angular/material/expansion';
import { MatInputModule } from '@angular/material/input';
import { MatSidenavModule } from '@angular/material/sidenav';
import { TimeagoModule } from 'ngx-timeago';
import { SharedModule } from 'app/shared.module';
import { AIImageComponent } from 'app/modules/admin/content/ai-image/ai-image.component';
import { ImageEditorDialogComponent } from 'app/modules/admin/content/ai-image/tools/image-editor.component';
import { FormsModule, ReactiveFormsModule } from '@angular/forms';
import { MatDialogModule } from '@angular/material/dialog';
import { MatSliderModule } from '@angular/material/slider';
import { MatSlideToggleModule } from '@angular/material/slide-toggle';
import { MatTooltipModule } from '@angular/material/tooltip';

const Routes: Route[] = [
    {
        path: '',
        component: AIImageComponent
    }
];

@NgModule({
    declarations: [
        AIImageComponent,
        ImageEditorDialogComponent,
    ],
    imports: [
        TranslocoModule,
        MatTooltipModule,
        RouterModule.forChild(Routes),
        MatButtonModule,
        MatIconModule,
        MatButtonModule,
        MatCheckboxModule,
        MatFormFieldModule,
        MatIconModule,
        MatInputModule,
        MatGridListModule,
        MatExpansionModule,
        MatListModule,
        MatSidenavModule,
        MatSelectModule,

        FormsModule,           // <--- QUAN TRỌNG: Phải có cái này để dùng [(ngModel)]
        ReactiveFormsModule,

        // --- MATERIAL MODULES ---
        MatDialogModule,
        MatSliderModule,       // <--- THÊM CÁI NÀY
        MatSlideToggleModule,  // <--- THÊM CÁI NÀY (Nguyên nhân chính gây lỗi)
        MatTooltipModule,      // <--- THÊM CÁI NÀY

        TimeagoModule.forRoot(),
        SharedModule
    ],
    schemas: [CUSTOM_ELEMENTS_SCHEMA],
})
export class AIImageModule {
}
