import { MatTooltipModule } from '@angular/material/tooltip';
import { HttpClient } from "@angular/common/http";
import {
  Translation,
  TranslocoLoader,
  provideTransloco,
  TranslocoModule
} from "@jsverse/transloco";
import { provideTranslocoMessageformat } from "@jsverse/transloco-messageformat";
import { Injectable, NgModule } from "@angular/core";
import { provideTranslocoLocale } from "@jsverse/transloco-locale";

@Injectable({ providedIn: "root" })
export class TranslocoHttpLoader implements TranslocoLoader {
  constructor(private http: HttpClient) { }

  getTranslation(lang: string) {
    return this.http.get<Translation>(`./assets/i18n/${lang}.json`);
  }
}

@NgModule({
  imports: [
        TranslocoModule,
        MatTooltipModule,
    // TranslocoPreloadLangsModule.forRoot(['lazy-page/es']),
  ],
  exports: [TranslocoModule],
  providers: [
    provideTransloco({
      config: {
        availableLangs: [
          { id: "en", label: "English" },
          { id: "vi", label: "Vietnam" }
        ],
        reRenderOnLangChange: true,
        fallbackLang: "en",
        defaultLang: "vi",
        missingHandler: {
          useFallbackTranslation: false
        }
      },
      loader: TranslocoHttpLoader
    }),
    provideTranslocoMessageformat(),
    provideTranslocoLocale({
      langToLocaleMapping: {
        en: "en-US",
        vi: "vi-VN"
      }
    })
  ]
})
export class TranslocoCoreModule { }

