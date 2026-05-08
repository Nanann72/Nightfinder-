import { useEffect, useState } from "react";
import { useNavigate, Link } from "react-router-dom";
import { useTranslation } from "react-i18next";
import { api } from "@/lib/api";
import { useAuth, formatApiError } from "@/lib/auth";
import FidelityBadge from "@/components/FidelityBadge";
import { Coins, Sparkles, Crown, Star, Gift, CheckCircle2, ArrowDownCircle, CreditCard, Plus, Trash2, Zap, X, Lock } from "lucide-react";
import { refreshWallet } from "@/components/WalletChip";
import { loadStripe } from "@stripe/stripe-js";
import { Elements, PaymentElement, useStripe, useElements } from "@stripe/react-stripe-js";
import { toast } from "sonner";

const ICONS = { starter: Gift, popular: Star, premium: Sparkles, vip: Crown };
const ACCENT = {
    starter: "from-white/5 to-white/[0.02]",
    popular: "from-magenta/10 to-surface",
    premium: "from-magenta/20 to-surface border-magenta/30",
    vip:     "from-magenta/30 via-magenta/10 to-surface border-magenta/50 shadow-glow",
};

export default function Wallet() {
    const { user } = useAuth();
    const { t } = useTranslation();
    const nav = useNavigate();
    const [wallet, setWallet] = useState(null);
    const [packs, setPacks] = useState([]);
    const [txs, setTxs] = useState([]);
    const [cards, setCards] = useState([]);
    const [autoReload, setAutoReload] = useState({ enabled: false, threshold: 50, pack_id: "popular" });
    const [loading, setLoading] = useState(null);
    const [cardOpen, setCardOpen] = useState(false);
    const [err, setErr] = useState("");

    const load = async () => {
        const [w, p, t, c, ar] = await Promise.all([
            api.get("/wallet"),
            api.get("/wallet/packs"),
            api.get("/wallet/transactions", { params: { limit: 20 } }),
            api.get("/wallet/cards"),
            api.get("/wallet/auto-reload"),
        ]);
        setWallet(w.data); setPacks(p.data); setTxs(t.data); setCards(c.data); setAutoReload(ar.data);
        refreshWallet();
    };
    useEffect(() => {
        // Background reconcile FIRST so any "paid but not credited" tx from a
        // previous session (Stripe redirect cut short, polling timed out, …)
        // settles before we render the balance. Cheap, idempotent, ~200 ms.
        (async () => {
            try {
                const { data } = await api.post("/wallet/reconcile");
                if (data?.coins_added > 0) {
                    toast.success(`+${data.coins_added} coins crédités après vérification ✨`);
                }
            } catch { /* ignore */ }
            load().catch(() => {});
        })();
    }, []);

    const buy = async (pack) => {
        if (!user) return nav("/login");
        setErr(""); setLoading(pack.pack_id);
        try {
            const { data } = await api.post("/wallet/buy", {
                pack_id: pack.pack_id,
                origin_url: window.location.origin,
            });
            window.location.href = data.url;
        } catch (e) {
            setErr(formatApiError(e.response?.data?.detail) || e.message);
            setLoading(null);
        }
    };

    return (
        <div className="relative z-10 container-mx py-10" data-testid="wallet-page">
            <div className="overline">{t("nav.wallet")}</div>
            <h1 className="mt-2 font-display text-4xl font-bold sm:text-5xl" dangerouslySetInnerHTML={{ __html: t("wallet.heading") }} />
            <p className="mt-2 max-w-xl text-white/60">
                {t("wallet.intro")}
            </p>

            {/* Balance hero */}
            <div className="mt-8 rounded-2xl border border-magenta/30 bg-gradient-to-br from-magenta/15 via-surface to-surface p-6 sm:p-8" data-testid="wallet-balance-card">
                <div className="flex flex-col gap-6 md:flex-row md:items-end md:justify-between">
                    <div>
                        <div className="flex items-center gap-3">
                            <Coins size={28} className="text-magenta" />
                            <span className="overline">{t("wallet.eyebrow")}</span>
                            {wallet?.badge && <FidelityBadge badge={wallet.badge} size="sm" />}
                        </div>
                        <div className="mt-3 flex items-end gap-3">
                            <span className="font-mono text-5xl font-bold sm:text-6xl">{wallet?.coin_balance ?? "…"}</span>
                            <span className="text-xl text-white/40">{t("wallet.coins")}</span>
                        </div>
                        <div className="mt-2 text-sm text-white/50">≈ {wallet?.eur_equivalent?.toFixed(2) ?? "…"} €</div>
                    </div>
                    <div className="grid grid-cols-2 gap-6 text-sm">
                        <div>
                            <div className="overline">{t("wallet.spent")}</div>
                            <div className="mt-1 font-mono text-2xl">{wallet?.lifetime_spent ?? 0}</div>
                        </div>
                        <div>
                            <div className="overline">{t("wallet.earned")}</div>
                            <div className="mt-1 font-mono text-2xl">{wallet?.lifetime_earned ?? 0}</div>
                        </div>
                    </div>
                </div>
                {wallet?.badge && (
                    <div className="mt-5 border-t border-white/5 pt-4" data-testid="wallet-badge-progress">
                        <FidelityBadge badge={wallet.badge} size="md" showProgress lifetimeSpent={wallet.lifetime_spent} />
                    </div>
                )}
            </div>

            {/* Referral CTA */}
            <Link to="/parrainage" data-testid="wallet-referral-cta"
                  className="mt-4 flex items-center gap-3 rounded-xl border border-magenta/20 bg-magenta/5 p-4 transition-colors hover:border-magenta/40 hover:bg-magenta/10">
                <div className="flex h-10 w-10 items-center justify-center rounded-xl bg-magenta/15 text-magenta-200">
                    <Gift size={18} />
                </div>
                <div className="flex-1">
                    <div className="font-semibold">{t("wallet.referral_banner.title")}</div>
                    <div className="text-xs text-white/50">{t("wallet.referral_banner.desc")}</div>
                </div>
                <div className="text-magenta-200">→</div>
            </Link>

            {err && <div className="mt-4 rounded-xl border border-red-500/30 bg-red-500/10 p-4 text-sm text-red-300" data-testid="wallet-error">{err}</div>}

            {/* Packs */}
            <h2 className="mt-12 font-display text-2xl font-bold">{t("wallet.recharge")}</h2>
            <div className="mt-6 grid gap-4 sm:grid-cols-2 lg:grid-cols-4">
                {packs.map((p) => {
                    const Icon = ICONS[p.pack_id] || Gift;
                    const total = p.coins + p.bonus;
                    const perEur = (total / p.eur).toFixed(1);
                    return (
                        <div key={p.pack_id}
                             data-testid={`pack-${p.pack_id}`}
                             className={`relative overflow-hidden rounded-2xl border border-white/10 bg-gradient-to-br p-6 ${ACCENT[p.pack_id]}`}>
                            {p.pack_id === "vip" && (
                                <span className="absolute right-4 top-4 rounded-full bg-magenta px-2 py-0.5 text-[10px] font-bold uppercase tracking-widest">
                                    Best value
                                </span>
                            )}
                            <div className="flex h-10 w-10 items-center justify-center rounded-xl border border-magenta/30 bg-magenta/10 text-magenta-200">
                                <Icon size={18} />
                            </div>
                            <h3 className="mt-4 font-display text-xl font-bold">{p.name}</h3>
                            <div className="mt-2 font-mono text-4xl font-bold">{p.coins}<span className="text-lg text-white/40"> {t("wallet.coins")}</span></div>
                            {p.bonus > 0 && (
                                <div className="mt-1 text-sm font-semibold text-magenta-300">+ {p.bonus} {t("wallet.bonus")}</div>
                            )}
                            <div className="mt-3 text-sm text-white/50">≈ {perEur} {t("wallet.per_euro")}</div>
                            <button
                                onClick={() => buy(p)}
                                disabled={loading === p.pack_id}
                                data-testid={`buy-${p.pack_id}`}
                                className="btn-primary mt-5 w-full justify-center"
                            >
                                {loading === p.pack_id ? t("wallet.redirecting") : t("wallet.buy_for", { eur: p.eur.toFixed(0) })}
                            </button>
                        </div>
                    );
                })}
            </div>

            {/* Transactions */}
            <h2 className="mt-12 font-display text-2xl font-bold">{t("wallet.recent_history")}</h2>
            <div className="mt-4 overflow-hidden rounded-2xl border border-white/5 bg-surface">
                {txs.length === 0 ? (
                    <div className="p-10 text-center text-sm text-white/40" data-testid="tx-empty">{t("wallet.history.empty")}</div>
                ) : (
                    <table className="w-full text-sm">
                        <thead>
                            <tr className="border-b border-white/5 text-left text-[11px] uppercase tracking-widest text-white/40">
                                <th className="px-4 py-3">{t("wallet.col.reason")}</th>
                                <th className="px-4 py-3">{t("wallet.col.date")}</th>
                                <th className="px-4 py-3 text-right">{t("wallet.coins")}</th>
                            </tr>
                        </thead>
                        <tbody>
                            {txs.map(t => (
                                <tr key={t.tx_id} className="border-b border-white/5 last:border-0">
                                    <td className="px-4 py-3">
                                        <div className="flex items-center gap-2">
                                            {t.delta > 0 ? <CheckCircle2 size={14} className="text-green-400" /> : <ArrowDownCircle size={14} className="text-magenta-300" />}
                                            <span className="capitalize">{t.reason.replaceAll("_", " ")}</span>
                                        </div>
                                    </td>
                                    <td className="px-4 py-3 text-white/50">{new Date(t.created_at).toLocaleString("fr-FR", { day: "2-digit", month: "short", hour: "2-digit", minute: "2-digit" })}</td>
                                    <td className={`px-4 py-3 text-right font-mono font-bold ${t.delta > 0 ? "text-green-300" : "text-magenta-200"}`}>
                                        {t.delta > 0 ? "+" : ""}{t.delta}
                                    </td>
                                </tr>
                            ))}
                        </tbody>
                    </table>
                )}
            </div>

            {/* Saved cards + auto-reload */}
            <div className="mt-12 grid gap-6 lg:grid-cols-2">
                <SavedCardsCard cards={cards} onReload={load} onAdd={() => setCardOpen(true)} />
                <AutoReloadCard settings={autoReload} packs={packs}
                                hasCard={cards.length > 0}
                                onReload={load} />
            </div>

            {cardOpen && <AddCardModal onClose={(saved) => { setCardOpen(false); if (saved) load(); }} />}
        </div>
    );
}

function SavedCardsCard({ cards, onReload, onAdd }) {
    const remove = async (id) => {
        if (!window.confirm("Supprimer cette carte ?")) return;
        await api.delete(`/wallet/cards/${id}`); onReload();
    };
    const setDefault = async (id) => {
        await api.post(`/wallet/cards/${id}/default`); onReload();
    };
    return (
        <div className="surface-card" data-testid="cards-section">
            <div className="flex items-start justify-between">
                <div>
                    <div className="overline flex items-center gap-1"><CreditCard size={12} /> Cartes enregistrées</div>
                    <p className="mt-1 text-sm text-white/50">Pour les recharges automatiques.</p>
                </div>
                <button onClick={onAdd} data-testid="add-card-btn" className="btn-outline-magenta text-sm">
                    <Plus size={14} /> Ajouter
                </button>
            </div>
            <div className="mt-4 space-y-3">
                {cards.length === 0 && (
                    <div className="rounded-xl border border-dashed border-white/10 p-8 text-center text-sm text-white/40" data-testid="no-cards">
                        Aucune carte enregistrée.
                    </div>
                )}
                {cards.map(c => (
                    <div key={c.card_id} data-testid={`card-${c.card_id}`}
                         className={`flex items-center justify-between rounded-xl border p-4 ${c.is_default ? "border-magenta/30 bg-magenta/5" : "border-white/5 bg-white/[0.02]"}`}>
                        <div className="flex items-center gap-3">
                            <div className="flex h-10 w-14 items-center justify-center rounded-md bg-gradient-to-br from-indigo-500/20 to-violet-500/20 text-xs font-bold text-white">
                                {c.brand}
                            </div>
                            <div>
                                <div className="font-mono text-sm">•••• {c.last4}</div>
                                <div className="text-xs text-white/40">Expire {String(c.exp_month).padStart(2,"0")}/{String(c.exp_year).slice(-2)}</div>
                            </div>
                        </div>
                        <div className="flex items-center gap-2">
                            {c.is_default ? (
                                <span className="rounded-full border border-magenta/30 bg-magenta/10 px-2 py-0.5 text-xs text-magenta-200">Par défaut</span>
                            ) : (
                                <button onClick={() => setDefault(c.card_id)} data-testid={`default-${c.card_id}`} className="rounded-full border border-white/10 px-2 py-0.5 text-xs text-white/60 hover:border-white/20 hover:text-white">
                                    Définir par défaut
                                </button>
                            )}
                            <button onClick={() => remove(c.card_id)} data-testid={`remove-${c.card_id}`} className="rounded-full p-1.5 text-white/40 hover:bg-red-500/10 hover:text-red-300">
                                <Trash2 size={14} />
                            </button>
                        </div>
                    </div>
                ))}
                <div className="mt-2 rounded-lg border border-emerald-500/20 bg-emerald-500/5 p-2 text-[11px] text-emerald-200/80 flex items-center gap-1.5">
                    <Lock size={11} /> Paiements sécurisés par Stripe — vos informations ne transitent jamais par nos serveurs.
                </div>
            </div>
        </div>
    );
}

function AutoReloadCard({ settings, packs, hasCard, onReload }) {
    const [form, setForm] = useState(settings);
    const [saving, setSaving] = useState(false);
    const [msg, setMsg] = useState("");
    useEffect(() => { setForm(settings); }, [settings]);

    const save = async (next) => {
        const target = next || form;
        setSaving(true); setMsg("");
        try {
            await api.post("/wallet/auto-reload", target);
            setMsg("Enregistré ✓"); onReload();
            setTimeout(() => setMsg(""), 2000);
        } catch (e) {
            setMsg(formatApiError(e.response?.data?.detail));
        } finally { setSaving(false); }
    };

    const selected = packs.find(p => p.pack_id === form.pack_id);

    return (
        <div className="surface-card" data-testid="auto-reload-section">
            <div className="overline flex items-center gap-1"><Zap size={12} /> Recharge automatique</div>
            <p className="mt-1 text-sm text-white/50">Ton wallet se recharge quand ton solde passe sous le seuil.</p>

            <div className="mt-4 flex items-center justify-between rounded-xl border border-white/5 bg-white/[0.02] p-4">
                <div>
                    <div className="text-sm font-semibold">Activer la recharge automatique</div>
                    {!hasCard && <div className="text-xs text-amber-300">Ajoute une carte d'abord.</div>}
                </div>
                <button
                    role="switch"
                    aria-checked={form.enabled}
                    onClick={() => {
                        const next = { ...form, enabled: !form.enabled };
                        setForm(next); save(next);
                    }}
                    disabled={!hasCard || saving}
                    data-testid="auto-reload-toggle"
                    className={`relative h-6 w-11 rounded-full transition-colors disabled:opacity-40 ${form.enabled ? "bg-magenta" : "bg-white/10"}`}
                >
                    <span className={`absolute top-0.5 h-5 w-5 rounded-full bg-white transition-all ${form.enabled ? "left-5" : "left-0.5"}`} />
                </button>
            </div>

            <div className="mt-4">
                <label className="text-xs text-white/60">Seuil de déclenchement (coins)</label>
                <input type="number" min={10} max={5000}
                       value={form.threshold}
                       onChange={(e) => setForm({ ...form, threshold: Number(e.target.value) })}
                       onBlur={() => save()}
                       data-testid="auto-reload-threshold"
                       className="input-base mt-1" />
            </div>

            <div className="mt-4">
                <label className="text-xs text-white/60">Pack à recharger</label>
                <div className="mt-2 grid grid-cols-2 gap-2">
                    {packs.map(p => (
                        <button
                            key={p.pack_id}
                            onClick={() => { const next = { ...form, pack_id: p.pack_id }; setForm(next); save(next); }}
                            data-testid={`auto-reload-pack-${p.pack_id}`}
                            className={`rounded-xl border px-3 py-2 text-left transition-all ${form.pack_id === p.pack_id ? "border-magenta bg-magenta/10" : "border-white/10 hover:border-white/20"}`}>
                            <div className="text-xs text-white/40">{p.name}</div>
                            <div className="font-mono text-sm font-bold">{p.coins + p.bonus} coins · {p.eur}€</div>
                        </button>
                    ))}
                </div>
            </div>

            {selected && form.enabled && (
                <div className="mt-4 rounded-lg border border-magenta/20 bg-magenta/5 p-3 text-xs text-magenta-200">
                    Quand ton solde passe sous <strong>{form.threshold}</strong>, nous rechargerons{" "}
                    <strong>{selected.coins + selected.bonus}</strong> coins pour{" "}
                    <strong>{selected.eur}€</strong> sur ta carte par défaut.
                </div>
            )}
            {msg && <div className="mt-3 text-xs text-white/60">{msg}</div>}
        </div>
    );
}

function AddCardModal({ onClose }) {
    const [clientSecret, setClientSecret] = useState("");
    const [publishableKey, setPublishableKey] = useState("");
    const [stripePromise, setStripePromise] = useState(null);
    const [err, setErr] = useState("");
    const [initLoading, setInitLoading] = useState(true);

    useEffect(() => {
        let mounted = true;
        (async () => {
            try {
                const { data } = await api.post("/wallet/cards/setup-intent");
                if (!mounted) return;
                setClientSecret(data.client_secret);
                setPublishableKey(data.publishable_key);
                setStripePromise(loadStripe(data.publishable_key));
            } catch (e) {
                setErr(formatApiError(e.response?.data?.detail) || e.message);
            } finally {
                setInitLoading(false);
            }
        })();
        return () => { mounted = false; };
    }, []);

    return (
        <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/80 backdrop-blur p-4" data-testid="add-card-modal">
            <div className="w-full max-w-md rounded-2xl border border-white/10 bg-surface p-6">
                <div className="flex items-center justify-between">
                    <h3 className="font-display text-xl font-bold">Ajouter une carte</h3>
                    <button type="button" onClick={() => onClose(false)} data-testid="card-close" className="rounded-full p-1 text-white/50 hover:bg-white/5 hover:text-white"><X size={16} /></button>
                </div>
                <p className="mt-2 text-xs text-white/50 flex items-center gap-1.5">
                    <Lock size={11} /> Sécurisé par Stripe · enregistrée pour la recharge automatique
                </p>

                {err && (
                    <div className="mt-4 rounded-lg border border-red-500/30 bg-red-500/10 p-3 text-sm text-red-300" data-testid="card-error">
                        {err}
                    </div>
                )}

                {initLoading && (
                    <div className="mt-6 text-center text-sm text-white/50" data-testid="card-init-loading">
                        Initialisation de la session sécurisée…
                    </div>
                )}

                {!initLoading && !err && clientSecret && stripePromise && (
                    <Elements
                        stripe={stripePromise}
                        options={{
                            clientSecret,
                            appearance: {
                                theme: "night",
                                variables: {
                                    colorPrimary: "#e91e63",
                                    colorBackground: "#1a1a1f",
                                    colorText: "#ffffff",
                                    colorDanger: "#f87171",
                                    fontFamily: "Inter, system-ui, sans-serif",
                                    borderRadius: "10px",
                                },
                            },
                        }}
                    >
                        <StripeCardForm onClose={onClose} />
                    </Elements>
                )}
            </div>
        </div>
    );
}

function StripeCardForm({ onClose }) {
    const stripe = useStripe();
    const elements = useElements();
    const [loading, setLoading] = useState(false);
    const [err, setErr] = useState("");

    const submit = async (e) => {
        e.preventDefault();
        if (!stripe || !elements) return;
        setErr(""); setLoading(true);
        try {
            const { error: setupErr, setupIntent } = await stripe.confirmSetup({
                elements,
                confirmParams: {
                    return_url: `${window.location.origin}/wallet`,
                },
                redirect: "if_required",
            });
            if (setupErr) {
                setErr(setupErr.message || "Erreur carte");
                setLoading(false);
                return;
            }
            if (setupIntent && setupIntent.payment_method) {
                await api.post("/wallet/cards/confirm", {
                    payment_method_id: setupIntent.payment_method,
                });
                onClose(true);
            } else {
                setErr("Carte non confirmée");
                setLoading(false);
            }
        } catch (e) {
            setErr(formatApiError(e.response?.data?.detail) || e.message);
            setLoading(false);
        }
    };

    return (
        <form onSubmit={submit} className="mt-5 space-y-4" data-testid="stripe-card-form">
            <PaymentElement options={{ layout: "tabs" }} />
            {err && <div className="rounded-lg border border-red-500/30 bg-red-500/10 p-3 text-sm text-red-300" data-testid="stripe-submit-error">{err}</div>}
            <button type="submit" disabled={loading || !stripe}
                    data-testid="card-submit" className="btn-primary w-full justify-center">
                {loading ? "Enregistrement sécurisé…" : "Enregistrer la carte"}
            </button>
            <p className="text-[11px] text-white/40 text-center">
                Aucun débit immédiat · la carte servira uniquement pour les recharges automatiques.
            </p>
        </form>
    );
}
