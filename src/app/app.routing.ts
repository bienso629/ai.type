import { Route } from '@angular/router';
import { AuthGuard } from 'app/core/auth/guards/auth.guard';
import { NoAuthGuard } from 'app/core/auth/guards/noAuth.guard';
import { PermissionGuard } from 'app/core/auth/guards/permission.guard';
import { LayoutComponent } from 'app/layout/layout.component';
import { InitialDataResolver } from 'app/app.resolvers';

// @formatter:off
/* eslint-disable max-len */
/* eslint-disable @typescript-eslint/explicit-function-return-type */
export const appRoutes: Route[] = [
    { path: '', pathMatch: 'full', redirectTo: 'app' },
    { path: 'signed-in-redirect', pathMatch: 'full', redirectTo: 'dashboard' },
    { path: 'json', loadChildren: () => import('app/modules/microsites/json/json.module').then(m => m.ReadJsonModule) },

    // Auth routes for guests
    {
        path: '',
        canActivate: [NoAuthGuard],
        canActivateChild: [NoAuthGuard],
        component: LayoutComponent,
        data: { layout: 'empty' },
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
        data: { layout: 'empty' },
        children: [
            { canActivate: [NoAuthGuard], path: 'app', loadChildren: () => import('app/modules/microsites/home/home.module').then(m => m.LandingAppModule) },
            { path: 'read', loadChildren: () => import('app/modules/microsites/read/read.module').then(m => m.ReadModule) },
            { path: 'livestream', loadChildren: () => import('app/modules/microsites/livestream/livestream.module').then(m => m.LivestreamModule) },
            { path: 'policy', loadChildren: () => import('app/modules/microsites/policy/policy.module').then(m => m.PolicyModule) },
            { path: 'privacy-policy', loadChildren: () => import('app/modules/microsites/policy/policy.module').then(m => m.PolicyModule) },
            { path: 'clause/privacy-policy', loadChildren: () => import('app/modules/microsites/policy/policy.module').then(m => m.PolicyModule) },
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
        data: { layout: 'empty' },
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
        resolve: { initialData: InitialDataResolver },
        children: [
            // --- Free routes (no group required) ---
            { path: 'ai-writer',      loadChildren: () => import('app/modules/admin/content/ai-writer/ai-writer.module').then(m => m.AIWriterModule) },
            { path: 'voice2video',    loadChildren: () => import('app/modules/admin/content/ai-tts/ai-tts.module').then(m => m.Voice2videoModule) },
            { path: 'ai-text2speech', loadChildren: () => import('app/modules/admin/content/ai-text2speech/ai-text2speech.module').then(m => m.AIText2SpeechModule) },
            { path: 'ai-image',       loadChildren: () => import('app/modules/admin/content/ai-image/ai-image.module').then(m => m.AIImageModule) },
            { path: 'nodes',          loadChildren: () => import('app/modules/admin/content/ai-nodes/ai-nodes.module').then(m => m.AINodesModule) },
            { path: 'wp2md',          loadChildren: () => import('app/modules/admin/content/archives/wp2md/wp2md.module').then(m => m.WP2MDModule) },
            { path: 'dashboard',      loadChildren: () => import('app/modules/admin/account/dashboard/dashboard.module').then(m => m.DashboardModule) },
            { path: 'tools',          loadChildren: () => import('app/modules/admin/account/tools/tools.module').then(m => m.AIToolsModule) },
            { path: 'dollar',         loadChildren: () => import('app/modules/admin/account/dollar/dollar.module').then(m => m.DollarModule) },
            { path: 'archives',       loadChildren: () => import('app/modules/admin/content/archives/archives.module').then(m => m.AIArchiveModule) },
            { path: 'collection',     loadChildren: () => import('app/modules/admin/content/collection/collection.module').then(m => m.CollectionModule) },
            { path: 'synonym',        loadChildren: () => import('app/modules/admin/content/synonym/synonym.module').then(m => m.SynonymModule) },
            { path: 'payment',        loadChildren: () => import('app/modules/microsites/payment/payment.module').then(m => m.PaymentModule) },
            { path: 'settings',       loadChildren: () => import('app/modules/admin/account/settings/settings.module').then(m => m.SettingsModule) },
            { path: 'profile',        loadChildren: () => import('app/modules/admin/account/profile/profile.module').then(m => m.ProfileModule) },

            // --- Routes protected by nhóm-đã-mua-ai-type ---
            { path: 'import',      canActivate: [PermissionGuard], data: { requiredGroup: 'nhóm-đã-mua-ai-type' }, loadChildren: () => import('app/modules/admin/content/sitemap/sitemap.module').then(m => m.SitemapModule) },
            { path: 'all-tube',    canActivate: [PermissionGuard], data: { requiredGroup: 'nhóm-đã-mua-ai-type' }, loadChildren: () => import('app/modules/admin/content/all-tube/all-tube.module').then(m => m.AllTubeModule) },
            { path: 'chatbot',     canActivate: [PermissionGuard], data: { requiredGroup: 'nhóm-đã-mua-ai-type' }, loadChildren: () => import('app/modules/admin/marketing/chatbot/chatbot.module').then(m => m.ChatBotModule) },
            { path: 'profiles',    canActivate: [PermissionGuard], data: { requiredGroup: 'nhóm-đã-mua-ai-type' }, loadChildren: () => import('app/modules/admin/marketing/gologin/gologin.module').then(m => m.ProfilesModule) },
            { path: 'woocommerce', canActivate: [PermissionGuard], data: { requiredGroup: 'nhóm-đã-mua-ai-type' }, loadChildren: () => import('app/modules/admin/marketing/clone-product/export.module').then(m => m.WoocommerceExportModule) },
            { path: 'customers',   canActivate: [PermissionGuard], data: { requiredGroup: 'nhóm-đã-mua-ai-type' }, loadChildren: () => import('app/modules/admin/marketing/x-cms/x-cms.module').then(m => m.XCmsModule) },
            { path: 'zalo',        canActivate: [PermissionGuard], data: { requiredGroup: 'nhóm-đã-mua-ai-type' }, loadChildren: () => import('app/modules/admin/marketing/zalo/zalo.module').then(m => m.ZaloModule) },

            // --- Routes protected by nhóm-thu-thập-dữ-liệu ---
            { path: 'ai-crawl',  canActivate: [PermissionGuard], data: { requiredGroup: 'nhóm-thu-thập-dữ-liệu' }, loadChildren: () => import('app/modules/admin/content/ai-crawl/ai-crawl.module').then(m => m.AIWordModule) },
            { path: 'face2node', canActivate: [PermissionGuard], data: { requiredGroup: 'nhóm-thu-thập-dữ-liệu' }, loadChildren: () => import('app/modules/admin/marketing/trend/trend.module').then(m => m.AIFacePostModule) },
            { path: 'data',      canActivate: [PermissionGuard], data: { requiredGroup: 'nhóm-thu-thập-dữ-liệu' }, loadChildren: () => import('app/modules/admin/marketing/bigdata/bigdata.module').then(m => m.BigDataModule) },

            // --- Routes protected by nhóm-seo-và-phân-tích ---
            { path: 'links', canActivate: [PermissionGuard], data: { requiredGroup: 'nhóm-seo-và-phân-tích' }, loadChildren: () => import('app/modules/admin/marketing/seo-links/seo-links.module').then(m => m.LinksModule) },

            // --- Routes protected by nhóm-đã-mua-ai-type (Báo cáo) ---
            { path: 'gscr',  canActivate: [PermissionGuard], data: { requiredGroup: 'nhóm-đã-mua-ai-type' }, loadChildren: () => import('app/modules/admin/marketing/seo-report/seo-report.module').then(m => m.GSCReportModule) },

            // --- Routes protected by nhóm-tự-động-hóa ---
            { path: 'amxh',     canActivate: [PermissionGuard], data: { requiredGroup: 'nhóm-tự-động-hóa' }, loadChildren: () => import('app/modules/admin/marketing/n8n/n8n.module').then(m => m.AMXHModule) },
            { path: 'schedule', redirectTo: 'amxh/schedule', pathMatch: 'full' },
        ]
    },
];
