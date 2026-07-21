import { Injectable } from '@angular/core';
import { HttpInterceptor, HttpRequest, HttpHandler, HttpEvent, HttpResponse } from '@angular/common/http';
import { Observable } from 'rxjs';
import { tap } from 'rxjs/operators';
import { GlobalAgentService } from './global-agent.service';

@Injectable()
export class GlobalAgentInterceptor implements HttpInterceptor {
    constructor(private globalAgentService: GlobalAgentService) {}

    intercept(request: HttpRequest<any>, next: HttpHandler): Observable<HttpEvent<any>> {
        return next.handle(request).pipe(
            tap(event => {
                if (event instanceof HttpResponse) {
                    // Only intercept JSON responses
                    const contentType = event.headers.get('content-type');
                    if (contentType && contentType.includes('application/json') && event.body) {
                        this.globalAgentService.addApiData(request.url, event.body);
                    } else if (event.body && (typeof event.body === 'object' || Array.isArray(event.body))) {
                        // Fallback check
                        this.globalAgentService.addApiData(request.url, event.body);
                    }
                }
            })
        );
    }
}
