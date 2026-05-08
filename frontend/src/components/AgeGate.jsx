import { useEffect, useState } from "react";
import { useLocation } from "react-router-dom";
import { useTranslation } from "react-i18next";
import { ShieldCheck, X, Sparkles } from "lucide-react";

const STORAGE_KEY = "meandyou_age_gate";
// Routes that must remain accessible without the age gate (legal pages, auth flows)
const PUBLIC_ROUTE_PREFIXES = ["/legal/", "/login", "/register", "/forgot-password", "/reset-password", "/auth/"];

export default function AgeGate() {
    const { t } = useTranslation();
    const { pathname } = useLocation();
    const [open, setOpen] = useState(false);

    useEffect(() => {
        const isPublic = PUBLIC_ROUTE_PREFIXES.some(p => pathname.startsWith(p));
        if (isPublic) { setOpen(false); return; }
        const seen = typeof window !== "undefined" ? localStorage.getItem(STORAGE_KEY) : "1";
        if (!seen) setOpen(true);
    }, [pathname]);

    const accept = () => {
        localStorage.setItem(STORAGE_KEY, "accepted");
        setOpen(false);
    };
    const refuse = () => {
        localStorage.setItem(STORAGE_KEY, "refused");
        setOpen(false);
        window.location.href = "https://www.google.com";
    };

    if (!open) return null;

    return (
        <div
            data-testid="age-gate-modal"
            className="fixed inset-0 z-[100] flex items-center justify-center bg-black/90 backdrop-blur-md p-4"
            role="dialog"
            aria-modal="true"
        >
            <div className="relative w-full max-w-lg rounded-2xl border border-white/10 bg-surface p-8 shadow-glow animate-fadeUp">
                <div className="flex flex-col items-center text-center">
                    <div className="mb-5 flex h-16 w-16 items-center justify-center rounded-2xl border border-magenta/40 bg-magenta/10">
                        <ShieldCheck className="text-magenta" size={32} />
                    </div>
                    <div className="overline mb-3">{t("age_gate.overline")}</div>
                    <h2 className="font-display text-3xl font-bold" dangerouslySetInnerHTML={{ __html: t("age_gate.heading") }} />
                    <p className="mt-4 text-sm leading-relaxed text-white/60">
                        {t("age_gate.body_full")}
                    </p>
                    <div className="mt-8 flex w-full flex-col gap-3">
                        <button
                            data-testid="age-gate-accept"
                            onClick={accept}
                            className="btn-primary w-full justify-center"
                        >
                            <Sparkles size={16} /> {t("age_gate.yes_long")}
                        </button>
                        <button
                            data-testid="age-gate-refuse"
                            onClick={refuse}
                            className="btn-ghost w-full justify-center"
                        >
                            <X size={16} /> {t("age_gate.no_long")}
                        </button>
                    </div>
                    <p className="mt-6 text-[11px] tracking-wide text-white/30">
                        {t("age_gate.privacy")}
                    </p>
                </div>
            </div>
        </div>
    );
}
