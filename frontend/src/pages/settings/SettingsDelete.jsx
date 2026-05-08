import { useState } from "react";
import { useNavigate } from "react-router-dom";
import { api, tokenStore } from "@/lib/api";
import { useAuth, formatApiError } from "@/lib/auth";
import { AlertTriangle, Trash2, ShieldOff } from "lucide-react";

export default function SettingsDelete() {
    const { setUser } = useAuth();
    const nav = useNavigate();
    const [confirmText, setConfirmText] = useState("");
    const [accepted, setAccepted] = useState(false);
    const [loading, setLoading] = useState(false);
    const [err, setErr] = useState("");

    const REQUIRED = "SUPPRIMER";
    const canSubmit = accepted && confirmText.trim().toUpperCase() === REQUIRED;

    const submit = async () => {
        if (!canSubmit || !window.confirm("Es-tu absolument sûr·e ? Cette action est irréversible.")) return;
        setLoading(true); setErr("");
        try {
            await api.delete("/users/me");
            tokenStore.clear?.();
            setUser?.(null);
            nav("/", { replace: true });
        } catch (e) {
            setErr(formatApiError(e.response?.data?.detail) || e.message);
            setLoading(false);
        }
    };

    return (
        <div className="space-y-6" data-testid="settings-delete">
            <header>
                <h2 className="font-display text-2xl font-bold text-red-200">Supprimer mon compte</h2>
                <p className="mt-1 text-sm text-white/55">Action définitive. Ton compte et tes données seront désactivés.</p>
            </header>

            <div className="rounded-3xl border border-red-500/40 bg-red-500/[0.06] p-6 sm:p-8">
                <div className="flex items-start gap-3">
                    <div className="flex h-10 w-10 shrink-0 items-center justify-center rounded-2xl bg-red-500/20 text-red-300">
                        <AlertTriangle size={20} />
                    </div>
                    <div>
                        <div className="font-display text-lg font-bold text-white">Cette action est irréversible</div>
                        <p className="mt-2 text-sm text-white/65">
                            En supprimant ton compte :
                        </p>
                        <ul className="mt-3 space-y-1.5 text-sm text-white/65">
                            <li className="flex items-start gap-2"><span className="mt-1 inline-block h-1 w-1 rounded-full bg-red-400" /> Ton profil sera désactivé immédiatement.</li>
                            <li className="flex items-start gap-2"><span className="mt-1 inline-block h-1 w-1 rounded-full bg-red-400" /> Tes coins restants seront perdus (non remboursables).</li>
                            <li className="flex items-start gap-2"><span className="mt-1 inline-block h-1 w-1 rounded-full bg-red-400" /> Tous tes abonnements actifs seront annulés.</li>
                            <li className="flex items-start gap-2"><span className="mt-1 inline-block h-1 w-1 rounded-full bg-red-400" /> Tes données seront effacées sous 30 jours (sauf obligations comptables).</li>
                        </ul>
                    </div>
                </div>

                <div className="mt-6 space-y-4">
                    <label className="flex items-start gap-3 text-sm text-white/75 cursor-pointer">
                        <input
                            type="checkbox"
                            checked={accepted}
                            onChange={e => setAccepted(e.target.checked)}
                            data-testid="settings-delete-confirm-checkbox"
                            className="mt-0.5 h-4 w-4 cursor-pointer accent-red-500"
                        />
                        <span>Je comprends que cette action est définitive et que je ne pourrai pas récupérer mon compte ni mes coins.</span>
                    </label>

                    <div>
                        <label className="text-xs text-white/55">
                            Tape <span className="font-mono font-bold text-red-300">{REQUIRED}</span> pour confirmer
                        </label>
                        <input
                            value={confirmText}
                            onChange={e => setConfirmText(e.target.value)}
                            data-testid="settings-delete-confirm-text"
                            className="input-base mt-1.5 font-mono uppercase tracking-widest"
                            placeholder={REQUIRED}
                        />
                    </div>

                    {err && <div className="rounded-2xl border border-red-500/30 bg-red-500/15 p-3 text-sm text-red-200" data-testid="settings-delete-error">{err}</div>}

                    <button
                        onClick={submit}
                        disabled={!canSubmit || loading}
                        data-testid="settings-delete-submit"
                        className="inline-flex w-full items-center justify-center gap-2 rounded-full border border-red-500/50 bg-red-500/15 px-7 py-3.5 text-sm font-semibold text-red-200 transition-all hover:bg-red-500/25 hover:border-red-500/70 disabled:opacity-40 disabled:cursor-not-allowed"
                    >
                        <Trash2 size={14} /> {loading ? "Suppression…" : "Supprimer définitivement mon compte"}
                    </button>
                </div>
            </div>

            <div className="rounded-2xl border border-white/5 bg-white/[0.02] p-4 text-sm text-white/55 flex items-start gap-2">
                <ShieldOff size={14} className="mt-0.5 shrink-0 text-white/40" />
                <span>Tu changes d'avis ? Tu peux simplement <a href="/settings/notifications" className="text-magenta-200 hover:text-white">désactiver les emails</a> ou contacter <a href="mailto:contact@meandyou.fans" className="text-magenta-200 hover:text-white">contact@meandyou.fans</a> avant de supprimer.</span>
            </div>
        </div>
    );
}
