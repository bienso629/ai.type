import { Injectable } from '@angular/core';
import { BehaviorSubject, Subject } from 'rxjs';

export interface AgentContext {
    sourcePage: string;
    action: string;
    data?: any;
    prompt?: string;
}

export interface AgentStreamMessage {
    role: 'user' | 'model';
    content: string;
    isStreaming?: boolean;
    isError?: boolean;
    replaceLast?: boolean; // Useful for updating progress
}

@Injectable({
    providedIn: 'root'
})
export class GlobalAgentService {
    // BehaviorSubject keeps the latest context
    private _contextSource = new BehaviorSubject<AgentContext | null>(null);
    currentContext$ = this._contextSource.asObservable();

    // Subject to pass results from Global Agent back to the page
    private _actionResultSource = new Subject<any>();
    actionResult$ = this._actionResultSource.asObservable();

    // Subject to stream messages from the page back to the Global Agent UI
    private _streamMessageSource = new Subject<AgentStreamMessage>();
    streamMessage$ = this._streamMessageSource.asObservable();

    constructor() { }

    updateContext(context: AgentContext) {
        this._contextSource.next(context);
    }

    clearContext() {
        this._contextSource.next(null);
    }

    getContext(): AgentContext | null {
        return this._contextSource.getValue();
    }

    sendActionResult(result: any) {
        this._actionResultSource.next(result);
    }

    sendStreamMessage(msg: AgentStreamMessage) {
        this._streamMessageSource.next(msg);
    }


    private _latestApiData: Record<string, any> = {};

    addApiData(url: string, data: any) {
        // Lấy pathname để rút gọn URL
        let key = url;
        try {
            const urlObj = new URL(url, 'http://localhost');
            key = urlObj.pathname;
        } catch (e) {}

        this._latestApiData[key] = data;
        
        // Giữ tối đa 10 API gần nhất để tránh phình to bộ nhớ
        const keys = Object.keys(this._latestApiData);
        if (keys.length > 10) {
            delete this._latestApiData[keys[0]];
        }
    }

    getApiData() {
        return this._latestApiData;
    }
}
