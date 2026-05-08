import { useState } from "react";
import { useNavigate } from "react-router-dom";
import { api } from "@/lib/api";
import { useAuth, formatApiError } from "@/lib/auth";
import { Video, Radio, Coins, Target, Lock, Gift } from "lucide-react";
import TipMenuEditor from "@/components/TipMenuEditor";

const DEFAULT_TIP_MENU = [
    { emoji: "💋", label: "Bisou", coins: 5 },
    { emoji: "🌹", label: "Rose", coins: 25 },
    { emoji: "💃", label: "Danse", coins: 50 },
    { emoji: "📸", label: "Photo dédicace", coins: 100 },
];

export default function GoLive() {
    const { user } = useAuth();
    const nav = useNavigate();
    const [title, setTitle] = useState("");
    const [description, setDescription] = useState("");
    const [isPpv, setIsPpv] = useState(false);
    const [ppvCoins, setPpvCoins] = useState(50);
    const [goalEnabled, setGoalEnabled] = useState(false);
    const [goalCoins, setGoalCoins] = useState(500);
    const [goalDescription, setGoalDescription] = useState("");
    const [privateMode, setPrivateMode] = useState(false);
    const [privateEntry, setPrivateEntry] = useState(100);
    const [tipMenuEnabled, setTipMenuEnabled] = useState(true);
    const [tipMenu, setTipMenu] = useState(DEFAULT_TIP_MENU);
    const [err, setErr] = useState("");
    const [loading, setLoading] = useState(false);

    if (user?.role !== "creator") {
        return (
            <div className="container-mx py-16">
                <div className="surface-card p-8 text-center" data-testid="live-forbidden">
                    <p className="text-white/70">Seules les créatrices peuvent lancer un live.</p>
                </div>
            </div>
        );
    }

    const submit = async (e) => {
        e.preventDefault(); setErr(""); setLoading(true);
        try {
            const { data } = await api.post("/live/start", {
                title, description,
                is_ppv: isPpv,
                ppv_coins: isPpv ? Number(ppvCoins) : 0,
                goal_coins: goalEnabled ? Number(goalCoins) : 0,
                goal_description: goalEnabled ? goalDescription : "",
                private_mode: privateMode,
                private_entry_coins: privateMode ? Number(privateEntry) : 0,
                tip_menu: tipMenuEnabled
                    ? tipMenu
                          .filter(i => (i.label || "").trim() && Number(i.coins) > 0)
                          .map(i => ({ label: i.label.trim(), emoji: i.emoji || "✨", coins: Number(i.coins) }))
                    : [],
            });
            nav(`/live/${data.session.session_id}?host=1`);
        } catch (e) {
            setErr(formatApiError(e.response?.data?.detail) || e.message);
            setLoading(false);
        }
    };

    return (
        <div className="relative z-10 container-mx py-8 max-w-2xl">
            <div className="overline flex items-center gap-2">
                <Radio size={12} className="text-red-400 animate-pulse" /> Lancer un live
            </div>
            <h1 className="mt-2 font-display text-3xl font-bold">Passe en direct avec tes fans 🎥</h1>
            <p className="mt-2 text-sm text-white/50">
                Configure ta session puis clique sur « Démarrer ». Tu pourras tout modifier en cours de live.
            </p>

            <form onSubmit={submit} className="mt-8 surface-card space-y-5" data-testid="go-live-form">
                <div>
                    <label className="text-xs text-white/60">Titre du live</label>
                    <input required maxLength={120} className="input-base mt-1"
                           placeholder="Ex : Séance cosy du dimanche soir"
                           value={title} onChange={e => setTitle(e.target.value)} data-testid="go-live-title" />
                </div>
                <div>
                    <label className="text-xs text-white/60">Description (optionnelle)</label>
                    <textarea maxLength={500} rows={3}
                              className="input-base mt-1 min-h-[80px] resize-none"
                              placeholder="Dis à tes fans ce que tu vas faire…"
                              value={description} onChange={e => setDescription(e.target.value)}
                              data-testid="go-live-description" />
                </div>

                {/* PPV */}
                <div className="rounded-xl border border-white/10 bg-white/[0.02] p-4">
                    <label className="flex items-center gap-2 text-sm text-white/80">
                        <input type="checkbox" checked={isPpv} onChange={e => setIsPpv(e.target.checked)}
                               data-testid="go-live-ppv-toggle" className="h-4 w-4 accent-magenta" />
                        Live payant (PPV) — les fans paient pour rejoindre
                    </label>
                    {isPpv && (
                        <div className="mt-3">
                            <label className="text-xs text-white/60">Prix d'entrée (coins)</label>
                            <div className="mt-2 flex gap-2">
                                {[25, 50, 100, 250].map(v => (
                                    <button type="button" key={v} onClick={() => setPpvCoins(v)}
                                        data-testid={`go-live-ppv-${v}`}
                                        className={`flex-1 rounded-xl border px-3 py-2 font-mono transition-all ${ppvCoins === v ? "border-magenta bg-magenta/20" : "border-white/10 hover:border-white/20"}`}>
                                        <Coins size={12} className="inline mr-1" /> {v}
                                    </button>
                                ))}
                            </div>
                            <input type="number" min={1} max={10000}
                                   className="input-base mt-2 font-mono"
                                   value={ppvCoins} onChange={e => setPpvCoins(Number(e.target.value))}
                                   data-testid="go-live-ppv-custom" />
                            <p className="mt-2 text-[11px] text-white/40">
                                Tu touches 80% — soit {Math.round(Number(ppvCoins) * 0.8)} coins par fan (≈ {(ppvCoins * 0.10 * 0.80).toFixed(2)} €).
                            </p>
                        </div>
                    )}
                </div>

                {/* Tip goal */}
                <div className="rounded-xl border border-white/10 bg-white/[0.02] p-4">
                    <label className="flex items-center gap-2 text-sm text-white/80">
                        <input type="checkbox" checked={goalEnabled} onChange={e => setGoalEnabled(e.target.checked)}
                               data-testid="go-live-goal-toggle" className="h-4 w-4 accent-magenta" />
                        <Target size={14} className="text-magenta-200" />
                        Objectif de pourboires affiché en direct
                    </label>
                    {goalEnabled && (
                        <div className="mt-3 grid gap-3 sm:grid-cols-2">
                            <div>
                                <label className="text-xs text-white/60">Cible (coins)</label>
                                <input type="number" min={1} max={100000}
                                       className="input-base mt-1 font-mono"
                                       value={goalCoins} onChange={e => setGoalCoins(Number(e.target.value))}
                                       data-testid="go-live-goal-coins" />
                                <p className="mt-1 text-[11px] text-white/40">≈ {(goalCoins * 0.1).toFixed(2)} €</p>
                            </div>
                            <div>
                                <label className="text-xs text-white/60">Récompense / motif</label>
                                <input type="text" maxLength={200}
                                       className="input-base mt-1"
                                       placeholder="Set photo exclusif"
                                       value={goalDescription}
                                       onChange={e => setGoalDescription(e.target.value)}
                                       data-testid="go-live-goal-desc" />
                            </div>
                        </div>
                    )}
                </div>

                {/* Private mode */}
                <div className="rounded-xl border border-white/10 bg-white/[0.02] p-4">
                    <label className="flex items-center gap-2 text-sm text-white/80">
                        <input type="checkbox" checked={privateMode}
                               onChange={e => setPrivateMode(e.target.checked)}
                               data-testid="go-live-private-toggle" className="h-4 w-4 accent-magenta" />
                        <Lock size={14} className="text-magenta-200" />
                        Démarrer en mode privé (réservé aux fans qui paient l'entrée)
                    </label>
                    {privateMode && (
                        <div className="mt-3">
                            <label className="text-xs text-white/60">Tarif d'entrée (coins)</label>
                            <input type="number" min={1} max={5000}
                                   className="input-base mt-1 font-mono"
                                   value={privateEntry}
                                   onChange={e => setPrivateEntry(Number(e.target.value))}
                                   data-testid="go-live-private-coins" />
                            <p className="mt-1 text-[11px] text-white/40">
                                Tu touches 80% — soit {Math.round(Number(privateEntry) * 0.8)} coins par entrée.
                            </p>
                        </div>
                    )}
                </div>

                {err && <div className="rounded-lg border border-red-500/30 bg-red-500/10 p-3 text-sm text-red-300" data-testid="go-live-error">{err}</div>}

                {/* Tip Menu */}
                <div className="rounded-xl border border-white/10 bg-white/[0.02] p-4">
                    <label className="flex items-center gap-2 text-sm text-white/80">
                        <input type="checkbox" checked={tipMenuEnabled}
                               onChange={e => setTipMenuEnabled(e.target.checked)}
                               data-testid="go-live-tipmenu-toggle" className="h-4 w-4 accent-magenta" />
                        <Gift size={14} className="text-magenta-200" />
                        Afficher un menu de pourboires (Stripchat-style)
                    </label>
                    {tipMenuEnabled && (
                        <div className="mt-4">
                            <TipMenuEditor items={tipMenu} onChange={setTipMenu} max={12} />
                            <p className="mt-2 text-[11px] text-white/40">
                                Les fans cliqueront sur un item pour envoyer le tip pré-rempli en 1 clic. Tu touches 80%.
                            </p>
                        </div>
                    )}
                </div>

                <button type="submit" disabled={loading || !title.trim()}
                        className="btn-primary w-full justify-center" data-testid="go-live-submit">
                    <Video size={16} /> {loading ? "Démarrage…" : "Démarrer le live"}
                </button>
            </form>
        </div>
    );
}
