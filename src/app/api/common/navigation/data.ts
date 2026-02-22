/* tslint:disable:max-line-length */
import { FuseNavigationItem } from '@fuse/components/navigation';

export const defaultNavigation: FuseNavigationItem[] = [
    {
        id: 'money',
        title: 'Thống kê',
        type: 'aside',
        icon: 'feather:square',
        classes: {
            icon: 'icon-size-6'
        },
        children: [
            {
                id: 'admin.payment',
                title: 'Thống kê',
                subtitle: 'Thống kê công việc.',
                type: 'basic',
                icon: 'feather:activity',
                classes: {
                    icon: 'icon-size-6'
                },
                link: '/dashboard'
            },
            {
                id: 'admin.payment',
                title: 'Nhuận bút',
                subtitle: 'Tiền nhuận bút của bạn.',
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
        title: 'Công cụ',
        type: 'aside',
        icon: 'feather:circle',
        classes: {
            icon: 'icon-size-6'
        },
        children: [
            {
                id: 'admin.tools',
                title: 'Công cụ',
                subtitle: 'Công cụ tạo nội dung AI.',
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
        title: 'Công việc',
        // subtitle: 'Ghi chú một số lỗi của hệ thống.',
        type: 'aside',
        icon: 'feather:triangle',
        classes: {
            icon: 'icon-size-6'
        },
        children: [
            {
                id: 'admin.archives',
                title: 'Công việc',
                subtitle: 'Nội dung đang soạn của bạn.',
                type: 'basic',
                icon: 'feather:edit-3',
                classes: {
                    icon: 'icon-size-6'
                },
                link: '/archives'
            }, {
                id: 'admin.ai-import-nodes',
                title: 'Sitemap',
                subtitle: 'Sitemap của các Website.',
                type: 'basic',
                icon: 'feather:git-merge',
                classes: {
                    icon: 'icon-size-6'
                },
                link: '/wp2md'
            }, {
                id: 'admin.ai-crawl-nodes',
                title: 'Thu thập',
                subtitle: 'Kết quả thu thập dữ liệu.',
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
        title: 'Quản trị',
        type: 'aside',
        icon: 'feather:x',
        classes: {
            icon: 'icon-size-8'
        },
        children: [
            {
                id: 'admin.changepass',
                title: 'Cấu hình',
                subtitle: 'Cấu hình ChatGPT, Nạp tiền.',
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
        title: 'Thống kê',
        type: 'aside',
        icon: 'feather:square',
        classes: {
            icon: 'icon-size-6'
        },
        link: '/dashboard'
    },
    {
        id: 'tool',
        title: 'Công cụ',
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
        title: 'Văn bản',
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
        title: 'Quản trị',
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
        title: 'Thống kê',
        type: 'aside',
        icon: 'feather:square',
        classes: {
            icon: 'icon-size-6'
        },
        link: '/dashboard'
    },
    {
        id: 'tool',
        title: 'Công cụ',
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
        title: 'Văn bản',
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
        title: 'Quản trị',
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
        title: 'Thống kê',
        type: 'aside',
        icon: 'feather:square',
        classes: {
            icon: 'icon-size-6'
        },
        link: '/dashboard'
    },
    {
        id: 'tool',
        title: 'Công cụ',
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
        title: 'Văn bản',
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
        title: 'Quản trị',
        type: 'aside',
        icon: 'feather:x',
        classes: {
            icon: 'icon-size-8'
        },
        children: []
    }
];
