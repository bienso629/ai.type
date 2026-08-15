import { Route } from '@angular/router';
import { AMXHComponent } from 'app/modules/admin/marketing/n8n/n8n.component';
import { AMXHScheduleComponent } from 'app/modules/admin/marketing/n8n/schedule/schedule.component';

export const settingsRoutes: Route[] = [
    {
        path: '',
        component: AMXHComponent
    },
    {
        path: 'schedule',
        component: AMXHScheduleComponent
    }
];
