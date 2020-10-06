import i18n, { ResourceLanguage } from "i18next";
import { initReactI18next } from "react-i18next";
import LanguageDetector from "i18next-browser-languagedetector";

import enTranslations from "./locales/en.yaml";
import deTranslations from "./locales/de.yaml";

export const languages = {
    en: { translation: enTranslations as ResourceLanguage },
    de: { translation: deTranslations as ResourceLanguage },
};

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
    });

export default i18n;
