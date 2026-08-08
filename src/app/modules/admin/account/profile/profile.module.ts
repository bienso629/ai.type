import { NgModule } from '@angular/core';
import { Route, RouterModule } from '@angular/router';
import { CommonModule } from '@angular/common';
import { SharedModule } from 'app/shared.module';
import { TextFieldModule } from '@angular/cdk/text-field';
import { MatExpansionModule } from '@angular/material/expansion';
import { MatMenuModule } from '@angular/material/menu';
import { MatDividerModule } from '@angular/material/divider';
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
        MatDividerModule
    ],
    providers: [SontinhSceneService, ProfileDataService]
})
export class ProfileModule { }
