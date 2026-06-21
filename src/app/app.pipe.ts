import { Pipe, PipeTransform } from "@angular/core";
import { DomSanitizer } from "@angular/platform-browser";

import * as $ from 'jquery';

const toTimestamp = (strDate: any) => {
    var datum = Date.parse(strDate);
    return datum / 1000;
}

@Pipe({ name: "checkExpirationDate" })
export class CheckExpirationDate implements PipeTransform {
    transform(activationInfo: any, expirationDate: any) {
        if (!activationInfo) {
            return false;
        } else if (activationInfo) {
            const date = new Date();
            const expirationDateT = toTimestamp(expirationDate);
            const dateT = toTimestamp(date);

            if ((expirationDateT - dateT) > 0) {
                return false;
            } else {
                return true;
            }
        } else {
            return false;
        }
    }
}

@Pipe({ name: "isFirefox" })
export class isFirefoxPipe implements PipeTransform {
    transform() {
        const agent = window.navigator.userAgent.toLowerCase()
        switch (true) {
            case agent.indexOf('edge') > -1:
                return 'edge';
            case agent.indexOf('opr') > -1 && !!(<any>window).opr:
                return 'opera';
            case agent.indexOf('chrome') > -1 && !!(<any>window).chrome:
                return 'chrome';
            case agent.indexOf('trident') > -1:
                return 'ie';
            case agent.indexOf('firefox') > -1:
                return 'firefox';
            case agent.indexOf('safari') > -1:
                return 'safari';
            default:
                return 'other';
        }
    }
}

@Pipe({ name: "isObject" })
export class IsObjectPipe implements PipeTransform {
    transform(item: any) {
        if (typeof item === "object") {
            return true;
        }
        else
            return false;
    }
}

@Pipe({ name: "isIframe" })
export class IsIframe implements PipeTransform {
    transform(value: any) {
        var tagsFound = [];
        if (value) {
            value.replace(/(<([^>]+)>)/gi, (m: string, m1: string, m2: string) => {
                if (m2.indexOf('iframe') >= 0) {
                    tagsFound.push(m);
                } else {
                    tagsFound.push();
                }
            });
        }

        if (tagsFound.length > 0) {
            return true;
        } else {
            return false;
        }
    }
}

@Pipe({ name: "isMp3" })
export class IsMp3 implements PipeTransform {
    transform(value: any) {
        if (value.indexOf('.mp3') >= 0) {
            return true;
        } else {
            return false;
        }
    }
}

@Pipe({ name: 'hackHTML' })
export class HackHTMLPipe implements PipeTransform {
    transform(value: any, tag: any): any {
        value = value.map((item: any) => {
            return item = `<${tag}>${item}</${tag}>`;
        });

        return value;
    }
}

@Pipe({ name: 'removeHTML' })
export class RemoveHTMLPipe implements PipeTransform {
    static transform: any;
    transform(value: string): string {
        if (value && value.length > 0) {
            return value.replace(/(<([^>]+)>)/gi, "");
        } else {
            return '';
        }
    }
}

@Pipe({ name: 'html2Paragraph' })
export class HTML2Paragraph implements PipeTransform {
    static transform: any;
    transform(value: string): any {
        if (value && value.length > 0) {
            var tagsFound = [];

            value.replace(/(<([^>]+)>)/gi, (m, m1, m2) => {
                // write data to result objcect
                tagsFound.push({
                    "tagName": m1,
                    "value": m2
                });

                return m;
            });

            return tagsFound;
        } else {
            return null;
        }
    }
}

@Pipe({ name: 'seoScore' })
export class SEOScorePipe implements PipeTransform {
    transform(data: any): any {
        if (data) {
            let html = data.done.join(' ');
            let mainkey = (data.mainkey) ? data.mainkey.replace(/(<([^>]+)>)/gi, "") : '';
            let title = data.title.replace(/(<([^>]+)>)/gi, "");
            let description = data.description.replace(/(<([^>]+)>)/gi, "");
            let h1 = html.match(/<h1[^>]*>(.*?)<\/h1>/gi);
            let h2 = html.match(/<h2[^>]*>(.*?)<\/h2>/gi);
            let links = html.match(/<a[^>]*>(.*?)<\/a>/gi);
            let img = html.match(/<img [^>]*src="[^"]*"[^>]*>/gm);
            let word_count = [];

            word_count = title ? title.split(/\s+/) : [];
            let total_title = word_count ? word_count.length : 0;
            let title_characters = word_count.join(" ").length;
            let find_title_mainkey = title.toLowerCase().indexOf(mainkey.toLowerCase());

            word_count = description ? description.split(/\s+/) : [];
            let total_description = word_count ? word_count.length : 0;
            let description_characters = word_count.join(" ").length;
            let find_description_mainkey = description.toLowerCase().indexOf(mainkey.toLowerCase());

            let total_h1 = h1 ? h1.length : 0;
            let h1_words = (h1) ? h1[0].replace(/(<([^>]+)>)/gi, "").split(/\s+/).length : 0;
            let h1_characters = (h1) ? h1[0].replace(/(<([^>]+)>)/gi, "").length : 0;
            let find_h1_mainkey = (h1) ? h1[0].replace(/(<([^>]+)>)/gi, "").toLowerCase().indexOf(mainkey.toLowerCase()) : -1;

            let total_h2 = h2 ? h2.length : 0;

            let first_paragraph = data.done[0];
            let text = html.replace(/(<([^>]+)>)/gi, "");
            let total_words = text ? text.split(/\s+/).length : 0;
            let find_words_mainkey_in_first_paragraph = (first_paragraph) ? first_paragraph.replace(/(<([^>]+)>)/gi, "").toLowerCase().indexOf(mainkey.toLowerCase()) : -1;
            let find_words_mainkey = 0;
            data.done.map((i: string) => {
                var re = new RegExp(mainkey.toLowerCase(), 'gi');
                let result = i.replace(/(<([^>]+)>)/gi, "").toLowerCase().match(re);
                if (i.replace(/(<([^>]+)>)/gi, "").toLowerCase().indexOf(mainkey.toLowerCase()) >= 0) {
                    find_words_mainkey = find_words_mainkey + result.length;
                }
            });
            let mainkey_percent_in_words = ((find_words_mainkey * (mainkey.split(/\s+/).length)) / total_words) * 100;

            let total_links = links ? links.length : 0;

            let total_img = img ? img.length : 0;
            let find_mainkey_in_alt = -1;

            return {
                mainkey: mainkey,
                title: {
                    words: total_title,
                    characters: title_characters,
                    findmainkey: find_title_mainkey
                },
                description: {
                    text: description,
                    words: total_description,
                    characters: description_characters,
                    findmainkey: find_description_mainkey
                },
                heading: {
                    h1: {
                        total: total_h1,
                        words: h1_words,
                        characters: h1_characters,
                        findmainkey: find_h1_mainkey
                    },
                    h2: total_h2
                },
                words: {
                    total: total_words,
                    find_mainkey_in_first_paragraph: find_words_mainkey_in_first_paragraph,
                    find_mainkey_in_words: find_words_mainkey,
                    mainkey_percent_in_words: mainkey_percent_in_words
                },
                links: total_links,
                images: {
                    total: total_img,
                    find_mainkey_in_alt: find_mainkey_in_alt
                }
            };
        } else {
            return {
                mainkey: '',
                title: {
                    words: 0,
                    characters: 0,
                    findmainkey: -1
                },
                description: {
                    text: '',
                    words: 0,
                    characters: 0,
                    findmainkey: -1
                },
                heading: {
                    h1: {
                        total: 0,
                        words: 0,
                        characters: 0,
                        findmainkey: -1
                    },
                    h2: 0
                },
                words: {
                    total: 0,
                    find_mainkey_in_first_paragraph: -1,
                    find_mainkey_in_words: -1,
                    mainkey_percent_in_words: 0
                },
                links: 0,
                images: {
                    total: 0,
                    find_mainkey_in_alt: -1
                }
            };
        }
    }
}

@Pipe({ name: 'slugify' })
export class SlugifyPipe implements PipeTransform {
    transform(str: string): string {
        // Chuyển hết sang chữ thường
        str = str.toLowerCase();
        // xóa dấu
        str = str
            .normalize('NFD') // chuyển chuỗi sang unicode tổ hợp
            .replace(/[\u0300-\u036f]/g, ''); // xóa các ký tự dấu sau khi tách tổ hợp
        // Thay ký tự đĐ
        str = str.replace(/[đĐ]/g, 'd');
        // Xóa ký tự đặc biệt
        str = str.replace(/([^0-9a-z-\s])/g, '');
        // Xóa khoảng trắng thay bằng ký tự -
        str = str.replace(/(\s+)/g, '-');
        // Xóa ký tự - liên tiếp
        str = str.replace(/-+/g, '-');
        // xóa phần dư - ở đầu & cuối
        str = str.replace(/^-+|-+$/g, '');

        // return
        return str;
    }
}

@Pipe({ name: 'renderTrustHTML' })
export class renderTrustHTML implements PipeTransform {
    constructor(
        private sanitized: DomSanitizer,
    ) { }
    transform(value: string) {
        if (value && value.length > 0) { 
            value = value
                .replace(/&#92;n/g, '')
                .replace(/&bsol;n/g, '')
                .replace(/\\\\n/g, '')
                .replace(/\\n/g, '')
                .replace(/\\\\r/g, '')
                .replace(/\\r/g, '')
                .replace(/(\r\n|\n|\r)/gm, '');

            if (value.indexOf('youtube-playlist') >= 0) {
                const playlist = $(value).text();
                value = `<iframe class="youtube-playlist" src="https://www.youtube.com/embed/?playlist=${playlist}&autoplay=0&controls=0&enablejsapi=1&showinfo=0&modestbranding=0&loop=0&fs=1&cc_load_policty=0&iv_load_policy=3&playsinline=1&color=1&widgetid=1"></iframe>`;
            }
            
            return this.sanitized.bypassSecurityTrustHtml(value);
        } else {
            return null;
        }
    }
}

@Pipe({ name: 'youtube' })
export class YoutubePlay implements PipeTransform {
    constructor(
        private sanitized: DomSanitizer,
    ) { }
    transform(code: string) {
        if (code) {
            return this.sanitized.bypassSecurityTrustHtml(`<iframe class="youtube-playlist rounded-lg" src="https://www.youtube.com/embed/${code}" title="YouTube video player" frameborder="0" allow="accelerometer; autoplay; clipboard-write; encrypted-media; gyroscope; picture-in-picture; web-share" referrerpolicy="strict-origin-when-cross-origin" allowfullscreen></iframe>`);
        } else {
            return 'Không hiển thị được nội dung';
        }
    }
}

@Pipe({ name: 'shortDomain' })
export class ShortDomainPipe implements PipeTransform {
    transform(url: string, args?: any): any {
        if (url) {
            if (url.length > 3) {
                let result: string;
                let match: string[];
                if (match = url.match(/^(?:https?:\/\/)?(?:www\.)?([^:\/\n?=]+)/im)) {
                    result = match[1];
                    if (match = result.match(/^[^.]+\.(.+\..+)$/))
                        result = match[1];
                }
                return result;
            }
            return url;
        }
        return url;
    }
}