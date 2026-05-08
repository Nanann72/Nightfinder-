import { useState, useRef, useEffect } from "react";
import { useTranslation } from "react-i18next";
import { LANGUAGES } from "@/i18n";
import { Globe, Check } from "lucide-react";

export default function LanguageSwitcher({ compact = false }) {
    const { i18n } = useTranslation();
    const [open, setOpen] = useState(false);
    const ref = useRef(null);
    const current = LANGUAGES.find(l => l.code === i18n.language?.split("-")[0]) || LANGUAGES[0];

    useEffect(() => {
        const onClickOutside = (e) => {
            if (ref.current && !ref.current.contains(e.target)) setOpen(false);
        };
        document.addEventListener("mousedown", onClickOutside);
        return () => document.removeEventListener("mousedown", onClickOutside);
    }, []);

    const change = (code) => {
        i18n.changeLanguage(code);
        setOpen(false);
    };

    return (
        <div className="relative" ref={ref}>
            <button
                type="button"
                onClick={() => setOpen(v => !v)}
                data-testid="lang-switcher-btn"
                className={`inline-flex items-center gap-1.5 rounded-full border border-white/10 bg-white/[0.03] px-3 py-1.5 text-xs font-semibold text-white/80 transition-all hover:border-white/20 hover:text-white ${
                    compact ? "" : "md:px-3"
                }`}
                aria-label="Change language"
            >
                <span className="text-base leading-none">{current.flag}</span>
                {!compact && <span className="hidden sm:inline">{current.code.toUpperCase()}</span>}
                <Globe size={10} className="opacity-60" />
            </button>
            {open && (
                <div
                    data-testid="lang-switcher-menu"
                    className="absolute right-0 top-full z-40 mt-2 w-44 overflow-hidden rounded-2xl border border-white/10 bg-surface/95 shadow-2xl backdrop-blur-xl"
                >
                    {LANGUAGES.map(lang => (
                        <button
                            key={lang.code}
                            type="button"
                            onClick={() => change(lang.code)}
                            data-testid={`lang-option-${lang.code}`}
                            className={`flex w-full items-center gap-2 px-3 py-2 text-left text-sm transition-colors ${
                                lang.code === current.code
                                    ? "bg-magenta/10 text-white"
                                    : "text-white/80 hover:bg-white/5"
                            }`}
                        >
                            <span className="text-base leading-none">{lang.flag}</span>
                            <span className="flex-1">{lang.label}</span>
                            {lang.code === current.code && <Check size={12} className="text-magenta-300" />}
                        </button>
                    ))}
                </div>
            )}
        </div>
    );
}
