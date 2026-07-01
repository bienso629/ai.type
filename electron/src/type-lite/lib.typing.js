const _ = require('lodash');
const cheerio = require("cheerio");
const util = require("util");

// delay một số thứ lại
const delay = (ms) => new Promise(resolve => setTimeout(resolve, ms));

module.exports = {
    key() {
        return 'U2FsdGVkX19OQ8qMShI0IRbjc+kanFY9288ume8sOahsKu0oM03rNQaBct6LFPSn';
    },
    // Đã xoá các module không sử dụng (chatgpt, facepost, capcut, linkcheck)
    getCompanyLink(req, companyListPage) {
        return new Promise(async (resolve, reject) => {
            // That's it, a single line of code to solve reCAPTCHAs 🎉
            let href_data = [];
            let href_navigation_data = [];

            await companyListPage.evaluateOnNewDocument(() => {
                // Pass webdriver check
                Object.defineProperty(navigator, 'webdriver', {
                    get: () => false,
                });
            });

            await companyListPage.evaluateOnNewDocument(() => {
                // Pass chrome check
                window.chrome = {
                    runtime: {},
                    // etc.
                };
            });

            await companyListPage.evaluateOnNewDocument(() => {
                //Pass notifications check
                const originalQuery = window.navigator.permissions.query;
                return window.navigator.permissions.query = (parameters) => (
                    parameters.name === 'notifications' ?
                    Promise.resolve({
                        state: Notification.permission
                    }) :
                    originalQuery(parameters)
                );
            });

            await companyListPage.evaluateOnNewDocument(() => {
                // Overwrite the `plugins` property to use a custom getter.
                Object.defineProperty(navigator, 'plugins', {
                    // This just needs to have `length > 0` for the current test,
                    // but we could mock the plugins too if necessary.
                    get: () => [1, 2, 3, 4, 5],
                });
            });

            await companyListPage.evaluateOnNewDocument(() => {
                // Overwrite the `languages` property to use a custom getter.
                Object.defineProperty(navigator, 'languages', {
                    get: () => ['en-US', 'en'],
                });
            });

            await companyListPage.goto(req.body.domain, {
                waitUntil: "networkidle2"
            });
            // await companyListPage.bringToFront();

            try {
                const html = await companyListPage.content();
                const $ = cheerio.load(html);
                const root_domain = req.body.root_domain;
                const page_domain = req.body.page_domain;

                const wrappers = Array.from($(`${req.body.main_class} a`), (el) =>
                    $(el)
                );

                for (const wrapper of wrappers) {
                    if (wrapper) {
                        let href = wrapper.attr("href");

                        // neu duong link co ton tai
                        if (href !== null) {
                            if (root_domain.length > 0) {
                                href = `${root_domain}${href}`;
                            } else {
                                href = `${href}`;
                            }
                        }

                        // chỉ lấy các link phù hợp với kết quả
                        if (
                            (href !== null &&
                                !_.some(href_data, {
                                    url: href,
                                }) &&
                                // (!util.isNullOrUndefined(req.body.domain)) ||
                                req.body.href_contain_str !== null &&
                                href.indexOf(req.body.href_contain_str) >= 0) ||
                            (req.body.href_contain_str !== null &&
                                href.indexOf(req.body.href_except_contain_str) < 0)
                        ) {
                            href_data.push({
                                url: href,
                            });
                        }
                    }
                }

                const wrappers1 = Array.from(
                    $(`${req.body.next_navigation_class} a`),
                    (el) => $(el)
                );

                for (const wrapper of wrappers1) {
                    if (wrapper) {
                        let href = wrapper.attr("href");

                        // neu duong link co ton tai
                        if (href !== null) {
                            if (page_domain.length > 0) {
                                href = `${page_domain}${href}`;
                            } else {
                                href = `${href}`;
                            }
                        }

                        // tách các link để tiếp tục dò tìm sitemap
                        if (
                            href !== null &&
                            req.body.domain !== null &&
                            page_domain !== href &&
                            !_.some(href_navigation_data, {
                                url: href,
                            })
                            // (!util.isNullOrUndefined(req.body.next_navigation_class) && href.indexOf(req.body.next_navigation_class) >= 0)
                        ) {
                            href_navigation_data.push({
                                url: href,
                            });
                        }
                    }
                }

                resolve({
                    href_data,
                    href_navigation_data
                });
            } catch (error) {
                console.log('error', error);
                resolve({
                    href_data: null,
                    href_navigation_data: null
                })
            }
        });
    },
    crawlCompany(req, crawlCompanyPage) {
        return new Promise(async (resolve, reject) => {
            const code = req.body.request;

            await crawlCompanyPage.evaluateOnNewDocument(() => {
                // Pass webdriver check
                Object.defineProperty(navigator, 'webdriver', {
                    get: () => false,
                });
            });

            await crawlCompanyPage.evaluateOnNewDocument(() => {
                // Pass chrome check
                window.chrome = {
                    runtime: {},
                    // etc.
                };
            });

            await crawlCompanyPage.evaluateOnNewDocument(() => {
                //Pass notifications check
                const originalQuery = window.navigator.permissions.query;
                return window.navigator.permissions.query = (parameters) => (
                    parameters.name === 'notifications' ?
                    Promise.resolve({
                        state: Notification.permission
                    }) :
                    originalQuery(parameters)
                );
            });

            await crawlCompanyPage.evaluateOnNewDocument(() => {
                // Overwrite the `plugins` property to use a custom getter.
                Object.defineProperty(navigator, 'plugins', {
                    // This just needs to have `length > 0` for the current test,
                    // but we could mock the plugins too if necessary.
                    get: () => [1, 2, 3, 4, 5],
                });
            });

            await crawlCompanyPage.evaluateOnNewDocument(() => {
                // Overwrite the `languages` property to use a custom getter.
                Object.defineProperty(navigator, 'languages', {
                    get: () => ['en-US', 'en'],
                });
            });

            await crawlCompanyPage.goto(req.body.url, {
                waitUntil: "networkidle2"
            });
            // await crawlCompanyPage.bringToFront();

            try {
                const html = await crawlCompanyPage.content();
                const $ = cheerio.load(html);
                const requests = code.split(/\r?\n|\r|\n/g);

                let result = {};
                for (let request of requests) {
                    request = request.split('|');
                    const tag_name = request[0].split(',')[0];
                    const region_selector = request[1];
                    const attrs = request[0].split(',')[1];

                    // tạo key mới trong object
                    if (!result[tag_name])
                        result[tag_name] = [];

                    const wrappers = Array.from($(`${region_selector} ${tag_name}`), (el) => $(el));
                    for (const wrapper of wrappers) {
                        if (wrapper) {
                            let t;

                            if (attrs) {
                                let a1 = attrs.split(':');
                                let a2 = attrs.split('+');

                                if (a1[1]) {
                                    if (wrapper.attr(a1[1])) {
                                        t = {
                                            [wrapper.attr(a1[1])]: wrapper.attr(a1[0])
                                        };
                                    }
                                } else if (a2[1]) {
                                    if (!a2[2]) {
                                        if (tag_name === 'img' || tag_name === 'iframe' || tag_name === 'source') {
                                            t = {
                                                ['src']: wrapper.attr(a2[0]),
                                                [a2[1]]: wrapper.attr(a2[1])
                                            };
                                        } else if (tag_name === 'a') {
                                            t = {
                                                [a2[0]]: wrapper.attr(a2[0]),
                                                [a2[1]]: wrapper.attr(a2[1]),
                                                'text': wrapper.text()
                                            };
                                        } else {
                                            t = {
                                                [a2[0]]: wrapper.attr(a2[0]),
                                                [a2[1]]: wrapper.attr(a2[1])
                                            };
                                        }
                                    } else {
                                        if (tag_name === 'img' || tag_name === 'iframe' || tag_name === 'source') {
                                            t = {
                                                ['src']: wrapper.attr(a2[0]),
                                                [a2[1]]: wrapper.attr(a2[1]),
                                                [a2[2]]: wrapper.attr(a2[2])
                                            };
                                        } else if (tag_name === 'a') {
                                            t = {
                                                [a2[0]]: wrapper.attr(a2[0]),
                                                [a2[1]]: wrapper.attr(a2[1]),
                                                [a2[2]]: wrapper.attr(a2[2]),
                                                'text': wrapper.text()
                                            };
                                        } else {
                                            t = {
                                                [a2[0]]: wrapper.attr(a2[0]),
                                                [a2[1]]: wrapper.attr(a2[1]),
                                                [a2[2]]: wrapper.attr(a2[2])
                                            };
                                        }
                                    }
                                } else {
                                    t = wrapper.attr(request[0].split(',')[1]);
                                }
                            } else {
                                if (tag_name === 'table') {
                                    t = wrapper.prop('outerHTML').replace(/(\r\n|\n|\r)/gm, "");
                                } else {
                                    t = wrapper.text();
                                }
                            }

                            if (!util.isNullOrUndefined(t)) {
                                result[tag_name].push(t);
                            }
                        }
                    }
                }

                resolve({
                    title: result.title[0],
                    heading: {
                        h1: result.h1,
                        h2: result.h2,
                        h3: result.h3,
                        h4: result.h4,
                        h5: result.h5
                    },
                    p: result.p,
                    div: result.div,
                    a: result.a,
                    img: result.img,
                    source: result.source,
                    others: {
                        pre: result.pre,
                        iframe: result.iframe,
                        table: result.table,
                        label: result.label,
                        span: result.span,
                        i: result.i,
                        li: result.li,
                        td: result.td,
                        dd: result.dd
                    },
                    meta: result.meta
                });
            } catch (error) {
                resolve({});
            }
        });
    },

}