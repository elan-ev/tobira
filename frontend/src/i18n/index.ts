import i18n from "i18next";
import type { DefaultNamespace, ParseKeys, ResourceLanguage } from "i18next";
import { initReactI18next } from "react-i18next";
import LanguageDetector from "i18next-browser-languagedetector";

import enTranslations from "./locales/en.yaml";
import deTranslations from "./locales/de.yaml";
import frTranslations from "./locales/fr.yaml";
import itTranslations from "./locales/it.yaml";

export const languages = {
    en: { translation: enTranslations as ResourceLanguage },
    de: { translation: deTranslations as ResourceLanguage },
    fr: { translation: frTranslations as ResourceLanguage },
    it: { translation: itTranslations as ResourceLanguage },
};

export type TranslationKey = ParseKeys<DefaultNamespace, Record<string, unknown>>;

// TODO: wait for `init` to complete before rendering?
void i18n
    .use(initReactI18next)
    .use(LanguageDetector)
    .init({
        resources: languages,
        fallbackLng: "en",
        interpolation: {
            escapeValue: false,
        },
        detection: {
            order: ["localStorage", "navigator"],
        },
        react: {
            transKeepBasicHtmlNodesFor: ["br", "strong", "i", "p", "code"],
        },
    });

export default i18n;

// Set the HTML `lang` attribute correctly
i18n.on("languageChanged", lng => document.documentElement.setAttribute("lang", lng));
if (i18n.resolvedLanguage) {
    document.documentElement.setAttribute("lang", i18n.resolvedLanguage);
}
