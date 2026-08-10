import { NgModule } from '@angular/core';
import { Route, RouterModule } from '@angular/router';
import { CommonModule } from '@angular/common';
import { SharedModule } from 'app/shared.module';
import { TextFieldModule } from '@angular/cdk/text-field';
import { MatExpansionModule } from '@angular/material/expansion';
import { MatMenuModule } from '@angular/material/menu';
import { MatDividerModule } from '@angular/material/divider';
import { MatTooltipModule } from '@angular/material/tooltip';
import { MatSlideToggleModule } from '@angular/material/slide-toggle';
import { MatSelectModule } from '@angular/material/select';
import { MatFormFieldModule } from '@angular/material/form-field';
import { MatInputModule } from '@angular/material/input';
import { MatListModule } from '@angular/material/list';
import { MatAutocompleteModule } from '@angular/material/autocomplete';
import { ProfileComponent } from 'app/modules/admin/account/profile/profile.component';
import { SontinhSceneService } from 'app/modules/admin/account/profile/sontinh-scene.service';
import { ProfileDataService } from 'app/modules/admin/account/profile/profile-data.service';

const routes: Route[] = [
    { path: '', component: ProfileComponent }
];

@NgModule({
    declarations: [ProfileComponent],
    imports: [
        RouterModule.forChild(routes),
        CommonModule,
        SharedModule,
        TextFieldModule,
        MatExpansionModule,
        MatMenuModule,
        MatDividerModule,
        MatTooltipModule,
        MatSlideToggleModule,
        MatSelectModule,
        MatFormFieldModule,
        MatInputModule,
        MatListModule,
        MatAutocompleteModule
    ],
    providers: [SontinhSceneService, ProfileDataService]
})
export class ProfileModule { }
