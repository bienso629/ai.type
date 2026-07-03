import { MatTooltipModule } from '@angular/material/tooltip';
import { TranslocoModule } from '@ngneat/transloco';
import { NgModule } from '@angular/core';
import { RouterModule, Routes } from '@angular/router';

const routes: Routes = [];

@NgModule({
  imports: [
        TranslocoModule,
        MatTooltipModule,RouterModule.forChild(routes)],
  exports: [RouterModule]
})
export class CollectionRoutingModule { }
