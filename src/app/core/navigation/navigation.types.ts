import { FuseNavigationItem } from '@fuse/components/navigation';

export interface Navigation
{
    compact: FuseNavigationItem[];
    default: FuseNavigationItem[];
    futuristic: FuseNavigationItem[];
    horizontal: FuseNavigationItem[];
}

/**
 * An object used to get page information from the server
 */
export interface Page {
    size: number;
    totalElements: number;
    totalPages: number;
    pageNumber: number;
}

export interface PageInfo {
    offset: number;
    pageSize: number;
    limit: number;
    count: number;
}