import i18n, { ResourceLanguage } from "i18next";
import { initReactI18next } from "react-i18next";
import LanguageDetector from "i18next-browser-languagedetector";

import enTranslations from "./locales/en.yaml";
import deTranslations from "./locales/de.yaml";

const resources = {
    en: { translation: enTranslations as ResourceLanguage },
    de: { translation: deTranslations as ResourceLanguage },
};

void i18n
    .use(initReactI18next)
    .use(LanguageDetector)
    .init({
        resources,
        fallbackLng: "en",
        interpolation: {
            escapeValue: false,
        },
        detection: {
            order: ["localStorage", "navigator"],
        },
    });

export default i18n;
