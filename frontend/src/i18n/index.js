import i18n from "i18next";
import { initReactI18next } from "react-i18next";
import LanguageDetector from "i18next-browser-languagedetector";

import fr from "./locales/fr";
import en from "./locales/en";
import es from "./locales/es";
import de from "./locales/de";
import it from "./locales/it";
import pt from "./locales/pt";

export const LANGUAGES = [
    { code: "fr", label: "Français", flag: "🇫🇷" },
    { code: "en", label: "English", flag: "🇬🇧" },
    { code: "es", label: "Español", flag: "🇪🇸" },
    { code: "de", label: "Deutsch", flag: "🇩🇪" },
    { code: "it", label: "Italiano", flag: "🇮🇹" },
    { code: "pt", label: "Português", flag: "🇵🇹" },
];

i18n
    .use(LanguageDetector)
    .use(initReactI18next)
    .init({
        resources: {
            fr: { translation: fr },
            en: { translation: en },
            es: { translation: es },
            de: { translation: de },
            it: { translation: it },
            pt: { translation: pt },
        },
        fallbackLng: "fr",
        supportedLngs: ["fr", "en", "es", "de", "it", "pt"],
        interpolation: { escapeValue: false },
        detection: {
            order: ["localStorage", "navigator", "htmlTag"],
            lookupLocalStorage: "meandyou_lang",
            caches: ["localStorage"],
        },
    });

export default i18n;
