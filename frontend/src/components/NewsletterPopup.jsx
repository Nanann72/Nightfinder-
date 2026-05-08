import { useEffect, useState } from "react";
import { api } from "@/lib/api";
import { Sparkles, X, Mail } from "lucide-react";

const STORAGE_KEY = "meandyou_newsletter_dismissed";
const DELAY_MS = 8000; // show after 8s of browsing

/**
 * Newsletter signup popup. Appears after ~8s of first visit, unless dismissed.
 * Stores email to db.newsletter_subscribers + flips user.newsletter_opt_in if the email matches an existing user.
 */
export default function NewsletterPopup() {
    const [open, setOpen] = useState(false);
    const [email, setEmail] = useState("");
    const [loading, setLoading] = useState(false);
    const [success, setSuccess] = useState(false);
    const [err, setErr] = useState("");

    useEffect(() => {
        const dismissed = localStorage.getItem(STORAGE_KEY);
        if (dismissed) return;
        const id = setTimeout(() => setOpen(true), DELAY_MS);
        return () => clearTimeout(id);
    }, []);

    const close = () => {
        setOpen(false);
        localStorage.setItem(STORAGE_KEY, "1");
    };

    const subscribe = async () => {
        if (!email || !email.includes("@")) { setErr("Email invalide"); return; }
        setErr(""); setLoading(true);
        try {
            await api.post("/newsletter/subscribe", { email, source: "popup" });
            setSuccess(true);
            localStorage.setItem(STORAGE_KEY, "1");
            setTimeout(close, 2500);
        } catch (e) {
            setErr(e.response?.data?.detail || "Impossible de s'inscrire, réessaie.");
        } finally { setLoading(false); }
    };

    if (!open) return null;

    return (
        <div className="fixed inset-0 z-[60] flex items-end justify-center bg-black/70 p-4 sm:items-center" data-testid="newsletter-popup">
            <div className="relative w-full max-w-md overflow-hidden rounded-2xl border border-magenta/30 bg-obsidian/95 p-6 shadow-[0_0_48px_rgba(217,70,239,0.35)] backdrop-blur-xl">
                <button onClick={close} data-testid="newsletter-close"
                        className="absolute right-3 top-3 rounded-full p-1 text-white/40 hover:bg-white/5 hover:text-white">
                    <X size={18} />
                </button>

                <div className="flex items-center gap-2 text-xs font-semibold uppercase tracking-widest text-magenta-300">
                    <Sparkles size={14} /> Newsletter me&amp;you
                </div>

                {!success ? (
                    <>
                        <h2 className="mt-3 font-display text-2xl font-bold leading-tight">
                            Ne rate plus rien 💌
                        </h2>
                        <p className="mt-2 text-sm text-white/60">
                            Nouvelles créatrices, lives exclusifs, offres coins... Les meilleures infos directement dans ta boîte mail.
                        </p>

                        <div className="mt-4 flex gap-2">
                            <div className="flex-1 flex items-center gap-2 rounded-xl border border-white/10 bg-black/30 px-3 py-2">
                                <Mail size={14} className="text-white/40" />
                                <input
                                    type="email"
                                    placeholder="ton@email.com"
                                    value={email}
                                    onChange={e => setEmail(e.target.value)}
                                    onKeyDown={e => e.key === "Enter" && subscribe()}
                                    className="flex-1 bg-transparent text-sm outline-none placeholder:text-white/30"
                                    data-testid="newsletter-email"
                                    autoFocus
                                />
                            </div>
                            <button onClick={subscribe} disabled={loading} data-testid="newsletter-submit"
                                    className="btn-primary">
                                {loading ? "..." : "Je m'inscris"}
                            </button>
                        </div>
                        {err && <div className="mt-2 text-xs text-red-300" data-testid="newsletter-error">{err}</div>}
                        <p className="mt-3 text-[11px] text-white/40">
                            Pas de spam, désinscription en 1 clic. Réservé aux +18 ans.
                        </p>
                    </>
                ) : (
                    <div className="py-4 text-center" data-testid="newsletter-success">
                        <div className="mx-auto mb-3 flex h-12 w-12 items-center justify-center rounded-full bg-green-500/20 text-green-400">
                            <Sparkles size={24} />
                        </div>
                        <h3 className="font-display text-xl font-bold">Inscrit·e ✓</h3>
                        <p className="mt-2 text-sm text-white/60">
                            Un email de bienvenue arrive dans ta boîte.
                        </p>
                    </div>
                )}
            </div>
        </div>
    );
}
