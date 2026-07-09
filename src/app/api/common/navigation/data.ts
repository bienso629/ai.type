/* tslint:disable:max-line-length */
import { FuseNavigationItem } from '@fuse/components/navigation';

export const defaultNavigation: FuseNavigationItem[] = [
    {
        id: 'money',
        title: 'nav.dashboard.title',
        type: 'aside',
        icon: 'feather:square',
        classes: {
            icon: 'icon-size-6'
        },
        children: [
            {
                id: 'admin.payment',
                title: 'nav.dashboard.title',
                subtitle: 'nav.dashboard.subtitle',
                type: 'basic',
                icon: 'feather:activity',
                classes: {
                    icon: 'icon-size-6'
                },
                link: '/dashboard'
            },
            {
                id: 'admin.payment',
                title: 'nav.revenue.title',
                subtitle: 'nav.revenue.subtitle',
                type: 'basic',
                icon: 'feather:dollar-sign',
                classes: {
                    icon: 'icon-size-6'
                },
                link: '/dollar'
            }
        ]
    },
    {
        id: 'tool',
        title: 'nav.tools.title',
        type: 'aside',
        icon: 'feather:circle',
        classes: {
            icon: 'icon-size-6'
        },
        children: [
            {
                id: 'admin.tools',
                title: 'nav.tools.title',
                subtitle: 'nav.tools.subtitle',
                type: 'basic',
                icon: 'feather:command',
                classes: {
                    icon: 'icon-size-6'
                },
                link: '/tools'
            }
        ]
    },
    {
        id: 'node',
        title: 'nav.jobs.title',
        // subtitle: 'Ghi chú một số lỗi của hệ thống.',
        type: 'aside',
        icon: 'feather:triangle',
        classes: {
            icon: 'icon-size-6'
        },
        children: [
            {
                id: 'admin.archives',
                title: 'nav.jobs.title',
                subtitle: 'nav.archives.subtitle',
                type: 'basic',
                icon: 'feather:edit-3',
                classes: {
                    icon: 'icon-size-6'
                },
                link: '/archives'
            }, {
                id: 'admin.ai-import-nodes',
                title: 'nav.sitemap.title',
                subtitle: 'nav.sitemap.subtitle',
                type: 'basic',
                icon: 'feather:map',
                classes: {
                    icon: 'icon-size-5'
                },
                link: '/wp2md'
            }, {
                id: 'admin.ai-crawl-nodes',
                title: 'nav.crawl.title',
                subtitle: 'nav.crawl.subtitle',
                type: 'basic',
                icon: 'feather:package',
                classes: {
                    icon: 'icon-size-6'
                },
                link: '/nodes'
            }
        ]
    },
    {
        id: 'admin',
        title: 'nav.admin.title',
        type: 'aside',
        icon: 'feather:x',
        classes: {
            icon: 'icon-size-8'
        },
        children: [
            {
                id: 'admin.changepass',
                title: 'nav.settings.title',
                subtitle: 'nav.settings.subtitle',
                type: 'basic',
                icon: 'feather:settings',
                classes: {
                    icon: 'icon-size-6'
                },
                link: '/settings'
            }
        ]
    }
];
export const compactNavigation: FuseNavigationItem[] = [
    {
        id: 'money',
        title: 'nav.dashboard.title',
        type: 'aside',
        icon: 'feather:square',
        classes: {
            icon: 'icon-size-6'
        },
        link: '/dashboard'
    },
    {
        id: 'tool',
        title: 'nav.tools.title',
        subtitle: 'Unique dashboard designs',
        type: 'aside',
        icon: 'feather:circle',
        classes: {
            icon: 'icon-size-6'
        },
        children: []
    },
    {
        id: 'node',
        title: 'nav.text.title',
        // subtitle: 'Ghi chú một số lỗi của hệ thống.',
        type: 'aside',
        icon: 'feather:triangle',
        classes: {
            icon: 'icon-size-6'
        },
        children: []
    },
    {
        id: 'admin',
        title: 'nav.admin.title',
        type: 'aside',
        icon: 'feather:x',
        classes: {
            icon: 'icon-size-8'
        },
        children: []
    }
];
export const futuristicNavigation: FuseNavigationItem[] = [
    {
        id: 'money',
        title: 'nav.dashboard.title',
        type: 'aside',
        icon: 'feather:square',
        classes: {
            icon: 'icon-size-6'
        },
        link: '/dashboard'
    },
    {
        id: 'tool',
        title: 'nav.tools.title',
        subtitle: 'Unique dashboard designs',
        type: 'aside',
        icon: 'feather:circle',
        classes: {
            icon: 'icon-size-6'
        },
        children: []
    },
    {
        id: 'node',
        title: 'nav.text.title',
        // subtitle: 'Ghi chú một số lỗi của hệ thống.',
        type: 'aside',
        icon: 'feather:triangle',
        classes: {
            icon: 'icon-size-6'
        },
        children: []
    },
    {
        id: 'admin',
        title: 'nav.admin.title',
        type: 'aside',
        icon: 'feather:x',
        classes: {
            icon: 'icon-size-8'
        },
        children: []
    }
];
export const horizontalNavigation: FuseNavigationItem[] = [
    {
        id: 'money',
        title: 'nav.dashboard.title',
        type: 'aside',
        icon: 'feather:square',
        classes: {
            icon: 'icon-size-6'
        },
        link: '/dashboard'
    },
    {
        id: 'tool',
        title: 'nav.tools.title',
        subtitle: 'Unique dashboard designs',
        type: 'aside',
        icon: 'feather:circle',
        classes: {
            icon: 'icon-size-6'
        },
        children: []
    },
    {
        id: 'node',
        title: 'nav.text.title',
        // subtitle: 'Ghi chú một số lỗi của hệ thống.',
        type: 'aside',
        icon: 'feather:triangle',
        classes: {
            icon: 'icon-size-6'
        },
        children: []
    },
    {
        id: 'admin',
        title: 'nav.admin.title',
        type: 'aside',
        icon: 'feather:x',
        classes: {
            icon: 'icon-size-8'
        },
        children: []
    }
];
