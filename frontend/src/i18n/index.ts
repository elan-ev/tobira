import i18n from "i18next";
import type { ResourceLanguage } from "i18next";
import { initReactI18next } from "react-i18next";
import LanguageDetector from "i18next-browser-languagedetector";

import { loadSavedEdits, TranslationCollection, TranslationRecord } from "../routes/Translations";
import enTranslations from "./locales/en.yaml";
import deTranslations from "./locales/de.yaml";


const unflatten = (flat: TranslationRecord) => {
    const result = {};
    Object.entries(flat).forEach(([path, value]) => {
        const keys = path.split(".");
        let cursor: TranslationRecord | TranslationCollection = result;
        keys.forEach((key, idx) => {
            if (idx === keys.length - 1) {
                cursor[key] = value;
            } else {
                if (!cursor[key] || typeof cursor[key] !== "object") {
                    cursor[key] = {};
                }
                cursor = cursor[key];
            }
        });
    });
    return result;
};

const saved = loadSavedEdits();

export const languages: Record<string, { translation: ResourceLanguage }> = {
    en: { translation: enTranslations as ResourceLanguage },
    de: { translation: deTranslations as ResourceLanguage },
    it: { translation: saved.it ? unflatten(saved.it) as ResourceLanguage : {} },
    fr: { translation: saved.fr ? unflatten(saved.fr) as ResourceLanguage : {} },
};

void i18n
    .use(initReactI18next)
    .use(LanguageDetector)
    .init({
        resources: languages,
        interpolation: { escapeValue: false },
        detection: { order: ["localStorage", "navigator"] },
        react: { transKeepBasicHtmlNodesFor: ["br", "strong", "i", "p", "code"] },
        returnEmptyString: false,
        returnNull: false,
        parseMissingKeyHandler: key => `⚠️ ${key}`,
    });

export default i18n;

// Set the HTML `lang` attribute correctly
i18n.on("languageChanged", lng => document.documentElement.setAttribute("lang", lng));
if (i18n.resolvedLanguage) {
    document.documentElement.setAttribute("lang", i18n.resolvedLanguage);
}
