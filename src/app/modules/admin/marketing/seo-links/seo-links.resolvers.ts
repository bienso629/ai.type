import { Injectable } from '@angular/core';
import { ActivatedRouteSnapshot, Resolve, RouterStateSnapshot } from '@angular/router';
import { Observable } from 'rxjs';
import { LogService } from 'app/_services/link';

@Injectable({
    providedIn: 'root',
})
export class LinksResolver implements Resolve<any> {
    /**
     * Constructor
     */
    constructor(private _logService: LogService) {
    }

    // -----------------------------------------------------------------------------------------------------
    // @ Public methods
    // -----------------------------------------------------------------------------------------------------

    /**
     * Resolver
     *
     * @param route
     * @param state
     */
    resolve(route: ActivatedRouteSnapshot, state: RouterStateSnapshot): Observable<any> {
        return this._logService.getData();
    }
}
