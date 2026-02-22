import { Layout } from 'app/layout/layout.types';

let settings = localStorage.getItem('settings');
settings = JSON.parse(settings);

// Types
export type Scheme = 'auto' | 'dark' | 'light';
export type Screens = { [key: string]: string };
export type Theme = 'theme-default' | string;
export type Themes = { id: string; name: string }[];
export type Settings = { bcrypt: boolean; domain: string, api: any, tts: any, sst: any, gen: string, gologin_api: string, puppeteer: string, chatbot: string, customer: string, bigdata: string, mxhauto: string };

/**
 * AppConfig interface. Update this interface to strictly type your config
 * object.
 */
export interface AppConfig {
    layout: Layout;
    scheme: Scheme;
    screens: Screens;
    theme: Theme;
    themes: Themes;
    settings: Settings;
}

/**
 * Default configuration for the entire application. This object is used by
 * FuseConfigService to set the default configuration.
 *
 * If you need to store global configuration for your app, you can use this
 * object to set the defaults. To access, update and reset the config, use
 * FuseConfigService and its methods.
 *
 * "Screens" are carried over to the BreakpointObserver for accessing them within
 * components, and they are required.
 *
 * "Themes" are required for Tailwind to generate themes.
 */
export const appConfig: AppConfig = {
    layout: 'thin',
    scheme: 'light',
    screens: {
        sm: '600px',
        md: '960px',
        lg: '1280px',
        xl: '1440px'
    },
    theme: 'theme-teal',
    themes: [
        {
            id: 'theme-default',
            name: 'Default'
        },
        {
            id: 'theme-brand',
            name: 'Brand'
        },
        {
            id: 'theme-teal',
            name: 'Teal'
        },
        {
            id: 'theme-rose',
            name: 'Rose'
        },
        {
            id: 'theme-purple',
            name: 'Purple'
        },
        {
            id: 'theme-amber',
            name: 'Amber'
        }
    ],
    settings: {
        bcrypt: false,
        domain: 'https://ai.type.vn',
        puppeteer: (settings && settings['typelite_plugin']) ? settings['typelite_plugin'] : 'http://localhost:12345',
        chatbot: (settings && settings['chatbot']) ? settings['chatbot'] : 'http://localhost:404',
        customer: (settings && settings['customer']) ? settings['customer'] : 'http://localhost:404',
        bigdata: (settings && settings['bigdata']) ? settings['bigdata'] : 'http://localhost:404',
        tts: (settings && settings['tts']) ? settings['tts'] : 'http://localhost:404',
        sst: (settings && settings['sst']) ? settings['sst'] : 'http://localhost:404',
        mxhauto: (settings && settings['mxhauto']) ? settings['mxhauto'] : 'http://localhost:404',
        gologin_api: 'https://api.gologin.com',
        api: {
            'local': (localStorage.getItem('server_local')) ? localStorage.getItem('server_local') : 'http://localhost:1122/v1',
            'vn.hcm.s0': 'https://apiv1.type.vn/v1',
            'vn.hcm.s1': 'https://api.vn.hcm.s1.type.vn/v1',
            'vn.hcm.s2': 'https://api.vn.hcm.s2.type.vn/v1',
            'vn.hn.s0': 'https://api.vn.hn.s0.type.vn/v1',
        },
        gen: 'ab:77:72:35:21:b8:3c:2e:25:b5:74:13:cb:91:fe:f4:7a:a7:dd:0a'
    }
};
