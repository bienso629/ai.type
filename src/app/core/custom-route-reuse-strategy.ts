import { RouteReuseStrategy, DetachedRouteHandle, ActivatedRouteSnapshot } from '@angular/router';

export class CustomRouteReuseStrategy implements RouteReuseStrategy {
    private handlers: { [key: string]: DetachedRouteHandle } = {};

    shouldDetach(route: ActivatedRouteSnapshot): boolean {
        // Để an toàn tuyệt đối, CHỈ lưu cache những route được chỉ định RÕ RÀNG (có cờ reuse: true)
        if (!route.routeConfig || route.routeConfig.loadChildren) return false;
        return route.data && route.data['reuse'] === true;
    }

    store(route: ActivatedRouteSnapshot, handle: DetachedRouteHandle): void {
        const path = this.getRoutePath(route);
        if (path) {
            this.handlers[path] = handle;
        }
    }

    shouldAttach(route: ActivatedRouteSnapshot): boolean {
        const path = this.getRoutePath(route);
        return !!route.routeConfig && !!this.handlers[path];
    }

    retrieve(route: ActivatedRouteSnapshot): DetachedRouteHandle | null {
        if (!route.routeConfig) return null;
        const path = this.getRoutePath(route);
        return this.handlers[path] || null;
    }

    shouldReuseRoute(future: ActivatedRouteSnapshot, curr: ActivatedRouteSnapshot): boolean {
        return future.routeConfig === curr.routeConfig;
    }

    private getRoutePath(route: ActivatedRouteSnapshot): string {
        // Lấy tên path định nghĩa trong Router (VD: 'dashboard') làm khóa, cách này an toàn 100% không bị trùng
        return route.routeConfig ? route.routeConfig.path : 'root';
    }
}
