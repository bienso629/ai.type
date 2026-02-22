import { HttpClient, HttpHeaders } from '@angular/common/http';
import { Injectable } from '@angular/core';
import { FuseConfigService } from '@fuse/services/config';
import { AppConfig } from 'app/core/config/app.config';
import { UserService } from 'app/core/user/user.service';
import { User } from 'app/core/user/user.types';
import { HelperService } from 'app/helper.service';

import { Observable, Subject, of } from 'rxjs';
import { catchError, tap, map, takeUntil } from 'rxjs/operators';

import * as Markdown from 'marked';
import { AuthUtils } from 'app/core/auth/auth.utils';

let options = {
    headers: new HttpHeaders({
        'content-type': 'application/json',
    })
};

@Injectable()
export class WP2MDService {
    year: number = 2023;
    config: AppConfig;
    user: User;
    private _unsubscribeAll: Subject<any> = new Subject<any>();

    constructor(
        private http: HttpClient,
        private _h: HelperService,
        private _userService: UserService,
        private _fuseConfigService: FuseConfigService
    ) {
        // Subscribe to user changes
        this._userService.user$
            .pipe(takeUntil(this._unsubscribeAll))
            .subscribe((user: User) => {
                this.user = user;
            });

        // Subscribe to config changes
        this._fuseConfigService.config$
            .pipe(takeUntil(this._unsubscribeAll))
            .subscribe((config: AppConfig) => {
                // Store the config
                this.config = config;
            });
    }

    public all(dataForm: any): Observable<any> {
        let activeInfo = localStorage.getItem('active_info'); if (!activeInfo) { return of(null); }
        activeInfo = AuthUtils._getActiveInfo(activeInfo); if (!activeInfo) return of(null);

        dataForm.year = this.year;
        dataForm.appId = 'ai.typing';
        dataForm.appToken = activeInfo['user']['appToken'];

        const url = `${this.config.settings.api[this.user.server]}/plugins/wp2md/archive/all`;

        let data = {
            params: this._h.encrypt(dataForm, this.config.settings.gen)
        };

        return this.http.post<any>(url, data, options).pipe(
            map(data => {
                return data;
            }),
            tap(_ => {
                // this.log('login');
            }),
            catchError(this.handleError('server', []))
        );
    }

    public totalWp2mdArchive(dataForm: any): Observable<any> {
        let activeInfo = localStorage.getItem('active_info'); if (!activeInfo) {return of(null);}
        activeInfo = AuthUtils._getActiveInfo(activeInfo); if (!activeInfo) return of(null);

        dataForm.year = this.year;
        dataForm.appId = 'ai.typing';
        dataForm.appToken = activeInfo['user']['appToken'];

        const url = `${this.config.settings.api[this.user.server]}/plugins/wp2md/archive/total`;

        let data = {
            params: this._h.encrypt(dataForm, this.config.settings.gen)
        };

        return this.http.post<any>(url, data, options).pipe(
            map(data => {
                return data;
            }),
            tap(_ => {
                // this.log('login');
            }),
            catchError(this.handleError('server', []))
        );
    }

    public searchWp2mdArchive(dataForm: any): Observable<any> {
        let activeInfo = localStorage.getItem('active_info'); if (!activeInfo) {return of(null);}
        activeInfo = AuthUtils._getActiveInfo(activeInfo); if (!activeInfo) return of(null);

        dataForm.year = this.year;
        dataForm.appId = 'ai.typing';
        dataForm.appToken = activeInfo['user']['appToken'];

        const url = `${this.config.settings.api[this.user.server]}/plugins/wp2md/archive/search`;

        let data = {
            params: this._h.encrypt(dataForm, this.config.settings.gen)
        };

        return this.http.post<any>(url, data, options).pipe(
            map(data => {
                return data;
            }),
            tap(_ => {
                // this.log('login');
            }),
            catchError(this.handleError('server', []))
        );
    }

    public details(dataForm: any): Observable<any> {
        let activeInfo = localStorage.getItem('active_info'); if (!activeInfo) {return of(null);}
        activeInfo = AuthUtils._getActiveInfo(activeInfo); if (!activeInfo) return of(null);

        dataForm.year = this.year;
        dataForm.appId = 'ai.typing';
        dataForm.appToken = activeInfo['user']['appToken'];

        const url = `${this.config.settings.api[this.user.server]}/plugins/wp2md/archive/details`;

        let data = {
            params: this._h.encrypt(dataForm, this.config.settings.gen)
        };

        return this.http.post<any>(url, data, options).pipe(
            map(data => {
                return data;
            }),
            tap(_ => {
                // this.log('login');
            }),
            catchError(this.handleError('server', []))
        );
    }

    public convert(dataForm: any): Observable<any> {
        let activeInfo = localStorage.getItem('active_info'); if (!activeInfo) {return of(null);}
        activeInfo = AuthUtils._getActiveInfo(activeInfo); if (!activeInfo) return of(null);

        dataForm.year = this.year;
        dataForm.appId = 'ai.typing';
        dataForm.appToken = activeInfo['user']['appToken'];

        const url = `${this.config.settings.api[this.user.server]}/plugins/wp2md/convert`;

        let data = {
            params: this._h.encrypt(dataForm, this.config.settings.gen)
        };

        return this.http.post<any>(url, data, options).pipe(
            map(data => {
                return data;
            }),
            tap(_ => {
                // this.log('login');
            }),
            catchError(this.handleError('server', []))
        );
    }

    public store(dataForm: any): Observable<any> {
        let activeInfo = localStorage.getItem('active_info'); if (!activeInfo) {return of(null);}
        activeInfo = AuthUtils._getActiveInfo(activeInfo); if (!activeInfo) return of(null);

        dataForm.year = this.year;
        dataForm.appId = 'ai.typing';
        dataForm.appToken = activeInfo['user']['appToken'];
        
        const url = `${this.config.settings.api[this.user.server]}/plugins/wp2md/archive`;

        let data = {
            params: this._h.encrypt(dataForm, this.config.settings.gen)
        };

        return this.http.post<any>(url, data, options).pipe(
            map(data => {
                return data;
            }),
            tap(_ => {
                // this.log('login');
            }),
            catchError(this.handleError('server', []))
        );
    }

    // tslint:disable-next-line: typedef
    private handleError<T>(operation = 'operation', result?: T) {
        return (error: any): Observable<T> => {
            // TODO: send the error to remote logging infrastructure
            console.error(error); // log to console instead

            // TODO: better job of transforming error for user consumption
            this.log(`${operation} failed: ${error.message}`);

            // Let the app keep running by returning an empty result.
            return of(result as T);
        };
    }

    /** Log a HeroService message with the MessageService */
    // tslint:disable-next-line: typedef
    private log(message: string) {
        console.log(message);
    }
}

export class MarkdownHtmlParserService {
    public parseHtmlToMarkdown(html: string): string {
        if (!html) {
            return '';
        }

        html = this.setBreaksToHtml(html);

        let markdown = html;
        let snipped = document.createElement('div');
        snipped.innerHTML = markdown;
        let links = snipped.getElementsByTagName('a');
        let markdownLinks = [];

        for (let i = 0; i < links.length; i++) {
            if (links[i]) {
                let marked = `[${links[i].innerText}](${links[i].href})`;
                markdown = markdown.replace(links[i].outerHTML, marked);
                markdownLinks[i] = marked;
            }
        }

        markdown = markdown.replace(/<h1>/g, '# ').replace(/<\/h1>/g, '');
        markdown = markdown.replace(/<h2>/g, '## ').replace(/<\/h1>/g, '');
        markdown = markdown.replace(/<h3>/g, '### ').replace(/<\/h1>/g, '');
        markdown = markdown.replace(/<h4>/g, '#### ').replace(/<\/h1>/g, '');
        markdown = this.parseAll(markdown, 'strong', '**');
        markdown = this.parseAll(markdown, 'b', '**');
        markdown = this.parseAll(markdown, 'em', '__');
        markdown = this.parseAll(markdown, 'i', '__');
        markdown = this.parseAll(markdown, 's', '~~');
        markdown = markdown.replace(/<p><br><\/p>/g, '\n');
        markdown = markdown.replace(/<br>/g, '\n');
        markdown = markdown.replace(/<p>/g, '').replace(/<\/p>/g, '  \n');
        markdown = markdown.replace(/<div>/g, '').replace(/<\/div>/g, '  \n');
        markdown = markdown
            .replace(/<blockquote>/g, '> ')
            .replace(/<\/blockquote>/g, '');

        markdown = this.parseList(markdown, 'ol', '1.');
        markdown = this.parseList(markdown, 'ul', '-');

        return markdown;
    }

    public parseMarkdownToHtml(markdown: string): any {
        markdown = this.setItalicSymbols(markdown);
        return Markdown.parse(markdown);
    }

    private setItalicSymbols(markdown: string): string {
        let regex = /\__(.*?)\__/g;
        let match;

        do {
            if (match) {
                markdown = markdown.replace(match[0], '<i>' + match[1] + '</i>');
            }
            match = regex.exec(markdown);
        } while (match);

        return markdown;
    }

    private parseAll(html: string, htmlTag: string, markdownEquivalent: string) {
        const regEx = new RegExp(`<\/?${htmlTag}>`, 'g');
        return html.replace(regEx, markdownEquivalent);
    }

    private parseList(
        html: string,
        listType: 'ol' | 'ul',
        identifier: string
    ): string {
        let parsedHtml = html;
        const getNextListRegEx = new RegExp(`<${listType}>.+?<\/${listType}>`);

        while (parsedHtml.match(getNextListRegEx) !== null) {
            const matchedList = parsedHtml.match(getNextListRegEx);

            const elements = this.htmlToElements(matchedList);
            const listItems = [];

            elements[0].childNodes.forEach((listItem) => {
                let parsedListItem = `${identifier} ${listItem.textContent}`;

                // @ts-ignore
                const className = listItem.className;
                if (className) {
                    const splittedClassName = className.split('-');
                    const numberOfLevel = parseInt(
                        splittedClassName[splittedClassName.length - 1] || 0
                    );

                    for (let i = 0; i < numberOfLevel; i++) {
                        parsedListItem = `   ${parsedListItem}`;
                    }
                }

                listItems.push(parsedListItem);
            });

            parsedHtml = parsedHtml.replace(
                getNextListRegEx,
                listItems.join('\n') + '\n\n'
            );
        }

        return parsedHtml;
    }

    private htmlToElements(html) {
        var template = document.createElement('template');
        template.innerHTML = html;

        return template.content.childNodes;
    }

    private setBreaksToHtml(html: string): string {
        return html.replace(/<p>/g, '<br> ').replace(/<\/p>/g, '');
    }
}