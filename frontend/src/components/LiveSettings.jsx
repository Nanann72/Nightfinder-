import { useEffect, useState } from "react";
import { api } from "@/lib/api";
import { formatApiError } from "@/lib/auth";
import {
    Video, Radio, Copy, CheckCircle2, ExternalLink, Settings2,
    Zap, Lock, AlertCircle, ChevronDown, ChevronUp,
} from "lucide-react";

/**
 * Creator dashboard card with advanced live settings:
 * - OBS Studio / Streamlabs RTMP ingress (generate stream key)
 * - Lovense connection (coming soon stub)
 * - Banned users list for current live session
 * Requires an active live session to generate OBS keys.
 */
export default function LiveSettings() {
    const [activeSession, setActiveSession] = useState(null);
    const [loading, setLoading] = useState(true);
    const [obs, setObs] = useState(null); // {url, stream_key, ingress_id}
    const [obsLoading, setObsLoading] = useState(false);
    const [obsCopied, setObsCopied] = useState(null);
    const [lovense, setLovense] = useState(null);
    const [err, setErr] = useState("");
    const [expanded, setExpanded] = useState(false);

    const loadAll = async () => {
        try {
            const [sessRes, lovRes] = await Promise.all([
                api.get("/live/active").catch(() => ({ data: [] })),
                api.get("/creators/me/lovense/status").catch(() => ({ data: null })),
            ]);
            const me = JSON.parse(localStorage.getItem("meandyou_user") || "{}");
            const myActive = (sessRes.data || []).find(s => s.creator_id === me.user_id);
            setActiveSession(myActive || null);
            setLovense(lovRes.data);
        } catch (e) {
            setErr(formatApiError(e.response?.data?.detail) || e.message);
        } finally { setLoading(false); }
    };

    useEffect(() => { loadAll(); }, []);

    const generateObs = async () => {
        if (!activeSession) {
            setErr("Démarre d'abord un live (bouton 'Go Live' en haut) pour générer ta clé OBS.");
            return;
        }
        setObsLoading(true); setErr("");
        try {
            const { data } = await api.post(`/live/${activeSession.session_id}/obs-ingress`);
            setObs(data);
        } catch (e) {
            setErr(formatApiError(e.response?.data?.detail) || e.message);
        } finally { setObsLoading(false); }
    };

    const copy = async (text, label) => {
        try {
            await navigator.clipboard.writeText(text);
            setObsCopied(label);
            setTimeout(() => setObsCopied(null), 2000);
        } catch { /* ignore */ }
    };

    if (loading) {
        return <div className="mt-8 surface-card text-sm text-white/40">Chargement paramètres live…</div>;
    }

    return (
        <div className="mt-8 surface-card border-magenta/20" data-testid="live-settings-card">
            <button
                onClick={() => setExpanded(!expanded)}
                data-testid="live-settings-toggle"
                className="flex w-full items-center justify-between gap-2 text-left"
            >
                <div className="min-w-0">
                    <div className="overline flex items-center gap-2">
                        <Settings2 size={12} /> Paramètres live avancés
                    </div>
                    <div className="mt-1 font-display text-xl font-bold sm:text-2xl">
                        OBS · Lovense · Modération
                    </div>
                    <div className="mt-1 text-sm text-white/60">
                        Streame depuis OBS, connecte ton toy Lovense, modère ton live en direct.
                    </div>
                </div>
                {expanded ? <ChevronUp size={20} /> : <ChevronDown size={20} />}
            </button>

            {expanded && (
                <div className="mt-6 space-y-6">
                    {/* OBS RTMP */}
                    <section data-testid="live-obs-section">
                        <div className="flex items-center gap-2 font-semibold">
                            <Video size={16} className="text-magenta-300" />
                            OBS Studio / Streamlabs
                        </div>
                        <p className="mt-1 text-xs text-white/50">
                            Stream ton live depuis OBS avec tous tes overlays, alertes, scènes. URL RTMP + clé de stream ci-dessous.
                        </p>

                        {!activeSession ? (
                            <div className="mt-3 rounded-lg border border-amber-500/30 bg-amber-500/5 p-3 text-xs text-amber-200">
                                <AlertCircle size={13} className="mr-1.5 inline" />
                                Démarre d'abord un live (bouton <strong>"Go Live"</strong> en haut du dashboard) pour générer ta clé OBS.
                            </div>
                        ) : !obs ? (
                            <button
                                onClick={generateObs}
                                disabled={obsLoading}
                                data-testid="live-obs-generate-btn"
                                className="btn-primary mt-3"
                            >
                                <Radio size={14} /> {obsLoading ? "Génération…" : "Générer ma clé OBS"}
                            </button>
                        ) : (
                            <div className="mt-3 space-y-3" data-testid="live-obs-credentials">
                                <FieldRow label="Serveur RTMP" value={obs.url} copied={obsCopied === "url"} onCopy={() => copy(obs.url, "url")} testId="live-obs-url" />
                                <FieldRow label="Clé de stream" value={obs.stream_key} sensitive copied={obsCopied === "key"} onCopy={() => copy(obs.stream_key, "key")} testId="live-obs-key" />
                                <div className="rounded-lg border border-white/5 bg-black/40 p-3 text-xs text-white/50">
                                    <div className="font-semibold text-white/80">Configuration OBS :</div>
                                    <ol className="mt-1 list-decimal pl-4">
                                        <li>OBS → Paramètres → <strong>Stream</strong></li>
                                        <li>Service : <strong>Personnalisé</strong></li>
                                        <li>Serveur : colle le Serveur RTMP ci-dessus</li>
                                        <li>Clé de stream : colle la clé ci-dessus</li>
                                        <li>Applique → clique <strong>"Commencer le streaming"</strong></li>
                                    </ol>
                                </div>
                            </div>
                        )}
                    </section>

                    {/* Lovense */}
                    <section data-testid="live-lovense-section" className="border-t border-white/5 pt-5">
                        <div className="flex items-center gap-2 font-semibold">
                            <Zap size={16} className="text-magenta-300" />
                            Lovense (toy interactif)
                        </div>
                        <p className="mt-1 text-xs text-white/50">
                            Lie ton Lovense à tes tips : chaque pourboire déclenche une vibration. Intégration via QR code.
                        </p>
                        {lovense?.connected ? (
                            <div className="mt-3 rounded-lg border border-green-500/30 bg-green-500/10 p-3 text-sm text-green-200">
                                <CheckCircle2 size={13} className="mr-1.5 inline" />
                                Toy Lovense connecté.
                            </div>
                        ) : (
                            <div className="mt-3 rounded-lg border border-magenta/20 bg-magenta/5 p-3 text-sm text-magenta-200" data-testid="live-lovense-coming-soon">
                                <Lock size={13} className="mr-1.5 inline" />
                                Bientôt disponible — intégration QR code Lovense Connect en cours.
                                <a href="https://www.lovense.com/app" target="_blank" rel="noopener noreferrer"
                                   className="mt-2 inline-flex items-center gap-1 text-xs text-magenta-300 underline">
                                    Télécharger Lovense Connect <ExternalLink size={11} />
                                </a>
                            </div>
                        )}
                    </section>

                    {/* Moderation info */}
                    <section data-testid="live-moderation-section" className="border-t border-white/5 pt-5">
                        <div className="flex items-center gap-2 font-semibold">
                            <AlertCircle size={16} className="text-magenta-300" />
                            Modération en direct
                        </div>
                        <p className="mt-1 text-xs text-white/50">
                            Pendant le live, clique sur le nom d'un spectateur dans le chat → <strong>"Bannir du live"</strong>.
                            La personne est déconnectée instantanément et ne peut pas rejoindre la session.
                        </p>
                    </section>

                    {err && <div className="rounded-lg border border-red-500/30 bg-red-500/10 p-3 text-sm text-red-300">{err}</div>}
                </div>
            )}
        </div>
    );
}

function FieldRow({ label, value, sensitive, copied, onCopy, testId }) {
    const [show, setShow] = useState(!sensitive);
    const display = sensitive && !show ? "•".repeat(Math.min(value?.length || 20, 30)) : value;
    return (
        <div>
            <div className="mb-1 flex items-center justify-between text-[11px] uppercase tracking-wider text-white/50">
                <span>{label}</span>
                {sensitive && (
                    <button onClick={() => setShow(!show)} className="text-[10px] text-magenta-300 hover:text-magenta-200">
                        {show ? "Masquer" : "Afficher"}
                    </button>
                )}
            </div>
            <div className="flex items-center gap-2">
                <code data-testid={testId} className="flex-1 overflow-x-auto rounded-lg border border-white/10 bg-black/40 px-3 py-2 font-mono text-xs text-white">
                    {display}
                </code>
                <button onClick={onCopy} data-testid={`${testId}-copy`}
                        className="shrink-0 rounded-lg border border-white/10 bg-white/5 p-2 text-white/60 hover:bg-white/10 hover:text-white">
                    {copied ? <CheckCircle2 size={14} className="text-green-400" /> : <Copy size={14} />}
                </button>
            </div>
        </div>
    );
}
