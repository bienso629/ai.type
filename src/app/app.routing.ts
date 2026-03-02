import { Route } from '@angular/router';
import { AuthGuard } from 'app/core/auth/guards/auth.guard';
import { NoAuthGuard } from 'app/core/auth/guards/noAuth.guard';
import { LayoutComponent } from 'app/layout/layout.component';
import { InitialDataResolver } from 'app/app.resolvers';

// @formatter:off
/* eslint-disable max-len */
/* eslint-disable @typescript-eslint/explicit-function-return-type */
export const appRoutes: Route[] = [
    // Redirect empty path to '/app'
    { path: '', pathMatch: 'full', redirectTo: 'app' },

    // Redirect signed in user to the '/app'
    //
    // After the user signs in, the sign in page will redirect the user to the 'signed-in-redirect'
    // path. Below is another redirection for that path to redirect the user to the desired
    // location. This is a small convenience to keep all main routes together here on this file.
    { path: 'signed-in-redirect', pathMatch: 'full', redirectTo: 'app' },
    { path: 'json', loadChildren: () => import('app/modules/microsites/json/json.module').then(m => m.ReadJsonModule) },

    // Auth routes for guests
    {
        path: '',
        canActivate: [NoAuthGuard],
        canActivateChild: [NoAuthGuard],
        component: LayoutComponent,
        data: {
            layout: 'empty'
        },
        children: [
            { path: 'confirmation-required', loadChildren: () => import('app/modules/auth/confirmation-required/confirmation-required.module').then(m => m.AuthConfirmationRequiredModule) },
            { path: 'forgot-password', loadChildren: () => import('app/modules/auth/forgot-password/forgot-password.module').then(m => m.AuthForgotPasswordModule) },
            { path: 'reset-password', loadChildren: () => import('app/modules/auth/reset-password/reset-password.module').then(m => m.AuthResetPasswordModule) },
            { path: 'sign-in', loadChildren: () => import('app/modules/auth/sign-in/sign-in.module').then(m => m.AuthSignInModule) },
            { path: 'sign-up', loadChildren: () => import('app/modules/auth/sign-up/sign-up.module').then(m => m.AuthSignUpModule) }
        ]
    },

    // Landing routes
    {
        path: '',
        component: LayoutComponent,
        data: {
            layout: 'empty'
        },
        children: [
            { path: 'app', loadChildren: () => import('app/modules/microsites/home/home.module').then(m => m.LandingAppModule) },
            { path: 'read', loadChildren: () => import('app/modules/microsites/read/read.module').then(m => m.ReadModule) },
            {
                canActivate: [AuthGuard],
                canActivateChild: [AuthGuard],
                path: 'archive',
                loadChildren: () => import('app/modules/microsites/archive/archive.module').then(m => m.ArchiveModule)
            },
        ]
    },

    // Auth routes for authenticated users
    {
        path: '',
        canActivate: [AuthGuard],
        canActivateChild: [AuthGuard],
        component: LayoutComponent,
        data: {
            layout: 'empty'
        },
        children: [
            { path: 'sign-out', loadChildren: () => import('app/modules/auth/sign-out/sign-out.module').then(m => m.AuthSignOutModule) },
            { path: 'unlock-session', loadChildren: () => import('app/modules/auth/unlock-session/unlock-session.module').then(m => m.AuthUnlockSessionModule) }
        ]
    },

    // Admin routes
    {
        path: '',
        canActivate: [AuthGuard],
        canActivateChild: [AuthGuard],
        component: LayoutComponent,
        resolve: {
            initialData: InitialDataResolver,
        },
        children: [
            { path: 'ai-writer', loadChildren: () => import('app/modules/admin/content/ai-writer/ai-writer.module').then(m => m.AIWriterModule) },
            { path: 'voice2video', loadChildren: () => import('app/modules/admin/content/voice2video/voice2video.module').then(m => m.Voice2videoModule) },
            { path: 'ai-crawl', loadChildren: () => import('app/modules/admin/content/ai-crawl/ai-crawl.module').then(m => m.AIWordModule) },
            { path: 'nodes', loadChildren: () => import('app/modules/admin/content/ai-nodes/ai-nodes.module').then(m => m.AINodesModule) },
            { path: 'wp2md', loadChildren: () => import('app/modules/admin/content/wp2md/wp2md.module').then(m => m.WP2MDModule) },
            { path: 'ai-text2speech', loadChildren: () => import('app/modules/admin/content/ai-text2speech/ai-text2speech.module').then(m => m.AIText2SpeechModule) },
            { path: 'ai-image', loadChildren: () => import('app/modules/admin/content/ai-image/ai-image.module').then(m => m.AIImageModule) },

            { path: 'dashboard', loadChildren: () => import('app/modules/admin/account/dashboard/dashboard.module').then(m => m.DashboardModule) },
            { path: 'tools', loadChildren: () => import('app/modules/admin/account/tools/tools.module').then(m => m.AIToolsModule) },
            { path: 'import', loadChildren: () => import('app/modules/admin/content/import/import.module').then(m => m.ImportModule) },
            { path: 'all-tube', loadChildren: () => import('app/modules/admin/content/all-tube/all-tube.module').then(m => m.AllTubeModule) },
            { path: 'dollar', loadChildren: () => import('app/modules/admin/account/dollar/dollar.module').then(m => m.DollarModule) },
            { path: 'archives', loadChildren: () => import('app/modules/admin/content/archives/archives.module').then(m => m.AIArchiveModule) },
            { path: 'synonym', loadChildren: () => import('app/modules/admin/content/synonym/synonym.module').then(m => m.SynonymModule) },
            { path: 'face2node', loadChildren: () => import('app/modules/admin/content/trend/trend.module').then(m => m.AIFacePostModule) },
            { path: 'payment', loadChildren: () => import('app/modules/microsites/payment/payment.module').then(m => m.PaymentModule) },
            { path: 'settings', loadChildren: () => import('app/modules/admin/account/settings/settings.module').then(m => m.SettingsModule) },

            { path: 'links', loadChildren: () => import('app/modules/admin/marketing/link-seo/link-seo.module').then(m => m.LinksModule) },
            { path: 'woocommerce', loadChildren: () => import('app/modules/admin/marketing/clone-product/export.module').then(m => m.WoocommerceExportModule) },
            { path: 'gscr', loadChildren: () => import('app/modules/admin/marketing/report-seo/report-seo.module').then(m => m.GSCReportModule) },
            { path: 'profiles', loadChildren: () => import('app/modules/admin/marketing/gologin/gologin.module').then(m => m.ProfilesModule) },
            { path: 'chatbot', loadChildren: () => import('app/modules/admin/marketing/chatbot/chatbot.module').then(m => m.ChatBotModule) },
            { path: 'amxh', loadChildren: () => import('app/modules/admin/marketing/n8n/n8n.module').then(m => m.AMXHModule) },
            { path: 'customers', loadChildren: () => import('app/modules/admin/marketing/customers/customers.module').then(m => m.CustomersModule) },
            { path: 'data', loadChildren: () => import('app/modules/admin/marketing/bigdata/bigdata.module').then(m => m.BigDataModule) },
        ]
    },
];
