import { useEffect, useState } from "react";
import { api } from "@/lib/api";
import { formatApiError } from "@/lib/auth";
import { Clock, CheckCircle2, X, Trash2, Tag, Plus, Target } from "lucide-react";

export default function Promotions() {
    const [promos, setPromos] = useState(null);
    const [challenge, setChallenge] = useState(null);
    const [openNew, setOpenNew] = useState(false);
    const [err, setErr] = useState("");

    const load = async () => {
        try {
            const [p, ch] = await Promise.all([
                api.get("/creators/me/promotions"),
                api.get("/creators/me/challenge"),
            ]);
            setPromos(p.data);
            setChallenge(ch.data);
        } catch (e) { setErr(formatApiError(e.response?.data?.detail)); }
    };
    useEffect(() => { load(); }, []);

    const stop = async (id) => {
        if (!window.confirm("Arrêter cette promo ?")) return;
        try { await api.delete(`/creators/me/promotions/${id}`); load(); }
        catch (e) { setErr(formatApiError(e.response?.data?.detail)); }
    };

    if (!promos || !challenge) return <div className="container-mx py-16 text-white/40" data-testid="promos-loading">Chargement…</div>;

    const active = promos.find(p => p.active && p.ends_at > new Date().toISOString());

    return (
        <div className="container-mx py-10 sm:py-16" data-testid="promos-page">
            <div className="overline flex items-center gap-2"><Tag size={12} /> Boost ta portée</div>
            <h1 className="mt-2 font-display text-3xl font-bold sm:text-4xl">Promotions & Challenge</h1>
            <p className="mt-2 text-white/60">Lance une promo flash pour attirer plus d'abonnés ou valide le challenge hebdo pour être mis·e en avant.</p>

            {err && <div className="mt-4 rounded-lg border border-red-500/30 bg-red-500/10 p-3 text-sm text-red-300">{err}</div>}

            {/* Challenge */}
            <div className="mt-8 surface-card border-magenta/20" data-testid="challenge-card">
                <div className="flex items-center gap-2">
                    <Target size={16} className="text-magenta-200" />
                    <div className="overline">Challenge hebdomadaire</div>
                </div>
                <div className="mt-3 flex items-center justify-between gap-4">
                    <div>
                        <div className="font-display text-xl font-bold">
                            {challenge.done} / {challenge.required} publications cette semaine
                        </div>
                        <div className="text-sm text-white/60">
                            {challenge.completed ? "✅ Challenge validé — mise en avant activée !" : `Publie ${challenge.required - challenge.done} contenu${(challenge.required - challenge.done) > 1 ? "s" : ""} de plus pour débloquer la mise en avant ${challenge.feature_hours}h.`}
                        </div>
                    </div>
                </div>
                <div className="mt-4 h-2 w-full overflow-hidden rounded-full bg-white/5">
                    <div className="h-full bg-gradient-to-r from-magenta to-magenta-400 transition-all"
                         style={{ width: `${Math.min(100, (challenge.done / challenge.required) * 100)}%` }} />
                </div>
                {challenge.featured_until && (
                    <div className="mt-3 inline-flex items-center gap-1.5 rounded-full border border-green-500/30 bg-green-500/10 px-3 py-1 text-xs text-green-300">
                        <CheckCircle2 size={12} /> Featured jusqu'au {new Date(challenge.featured_until).toLocaleString("fr-FR", { dateStyle: "short", timeStyle: "short" })}
                    </div>
                )}
            </div>

            {/* Active promo */}
            <div className="mt-8 flex items-center justify-between">
                <h2 className="font-display text-xl font-bold">Promotions</h2>
                {!active && (
                    <button onClick={() => setOpenNew(true)} className="btn-primary" data-testid="promo-new-btn">
                        <Plus size={14} /> Nouvelle promo
                    </button>
                )}
            </div>

            {active && (
                <div className="mt-4 surface-card border-magenta/40 bg-magenta/5" data-testid="active-promo">
                    <div className="flex items-start justify-between gap-3">
                        <div>
                            <div className="overline text-magenta-200">Promo active</div>
                            <div className="mt-2 font-display text-2xl font-bold text-white">-{active.percent_off}%</div>
                            <div className="mt-1 text-sm text-white/60">{active.label}</div>
                            <div className="mt-2 flex items-center gap-1.5 text-xs text-white/50">
                                <Clock size={11} /> Termine {new Date(active.ends_at).toLocaleString("fr-FR", { dateStyle: "short", timeStyle: "short" })}
                            </div>
                        </div>
                        <button onClick={() => stop(active.promo_id)} className="btn-ghost" data-testid="promo-stop-btn">
                            <X size={14} /> Arrêter
                        </button>
                    </div>
                </div>
            )}

            {/* History */}
            {promos.filter(p => p.promo_id !== active?.promo_id).length > 0 && (
                <div className="mt-8">
                    <div className="overline">Historique</div>
                    <div className="mt-3 space-y-2">
                        {promos.filter(p => p.promo_id !== active?.promo_id).slice(0, 10).map(p => (
                            <div key={p.promo_id} data-testid={`promo-history-${p.promo_id}`}
                                 className="flex items-center justify-between rounded-xl border border-white/5 bg-white/[0.02] px-4 py-3 text-sm">
                                <div>
                                    <span className="font-mono font-bold">-{p.percent_off}%</span>
                                    <span className="ml-2 text-white/60">{p.label}</span>
                                </div>
                                <div className="text-xs text-white/40">
                                    {new Date(p.created_at).toLocaleDateString("fr-FR")}
                                </div>
                            </div>
                        ))}
                    </div>
                </div>
            )}

            {openNew && <NewPromoModal onClose={(saved) => { setOpenNew(false); if (saved) load(); }} />}
        </div>
    );
}

function NewPromoModal({ onClose }) {
    const [percent, setPercent] = useState(30);
    const [hours, setHours] = useState(24);
    const [label, setLabel] = useState("");
    const [loading, setLoading] = useState(false);
    const [err, setErr] = useState("");

    const submit = async (e) => {
        e.preventDefault(); setErr(""); setLoading(true);
        try {
            await api.post("/creators/me/promotions", { percent_off: percent, duration_hours: hours, label });
            onClose(true);
        } catch (e) {
            setErr(formatApiError(e.response?.data?.detail)); setLoading(false);
        }
    };

    return (
        <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/80 backdrop-blur p-4" data-testid="new-promo-modal">
            <form onSubmit={submit} className="w-full max-w-md rounded-2xl border border-magenta/30 bg-surface p-6">
                <div className="flex items-center justify-between">
                    <h3 className="font-display text-xl font-bold">Nouvelle promo</h3>
                    <button type="button" onClick={() => onClose(false)} className="rounded-full p-1 text-white/50 hover:bg-white/5"><X size={16} /></button>
                </div>
                <div className="mt-5 space-y-4">
                    <div>
                        <label className="text-xs text-white/60">Réduction</label>
                        <div className="mt-2 flex gap-2">
                            {[10, 25, 50, 75].map(v => (
                                <button type="button" key={v} onClick={() => setPercent(v)}
                                        data-testid={`promo-preset-${v}`}
                                        className={`flex-1 rounded-xl border px-2 py-3 font-mono transition-all ${percent === v ? "border-magenta bg-magenta/20" : "border-white/10"}`}>
                                    -{v}%
                                </button>
                            ))}
                        </div>
                    </div>
                    <div>
                        <label className="text-xs text-white/60">Durée</label>
                        <div className="mt-2 flex gap-2">
                            {[{ h: 1, l: "1h flash" }, { h: 24, l: "24h" }, { h: 48, l: "48h" }, { h: 168, l: "7 jours" }].map(o => (
                                <button type="button" key={o.h} onClick={() => setHours(o.h)}
                                        data-testid={`promo-duration-${o.h}`}
                                        className={`flex-1 rounded-xl border px-2 py-2.5 text-xs transition-all ${hours === o.h ? "border-magenta bg-magenta/20" : "border-white/10"}`}>
                                    {o.l}
                                </button>
                            ))}
                        </div>
                    </div>
                    <div>
                        <label className="text-xs text-white/60">Intitulé (optionnel)</label>
                        <input type="text" className="input-base mt-2" maxLength={40}
                               placeholder="Black Friday, -50% weekend…"
                               value={label}
                               onChange={e => setLabel(e.target.value)}
                               data-testid="promo-label" />
                    </div>
                    {err && <div className="rounded-lg border border-red-500/30 bg-red-500/10 p-3 text-sm text-red-300">{err}</div>}
                    <button type="submit" disabled={loading} className="btn-primary w-full justify-center" data-testid="promo-submit">
                        {loading ? "Création…" : `Lancer la promo -${percent}% · ${hours}h`}
                    </button>
                </div>
            </form>
        </div>
    );
}
