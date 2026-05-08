import { useState } from "react";
import { api } from "@/lib/api";
import { formatApiError } from "@/lib/auth";
import FileUploader from "@/components/FileUploader";
import { Megaphone, X, Send, Coins } from "lucide-react";

export default function BroadcastModal({ onClose }) {
    const [body, setBody] = useState("");
    const [mediaUrl, setMediaUrl] = useState("");
    const [paywallCoins, setPaywallCoins] = useState(0);
    const [result, setResult] = useState(null);
    const [err, setErr] = useState("");
    const [loading, setLoading] = useState(false);

    const submit = async (e) => {
        e.preventDefault(); setErr(""); setLoading(true);
        try {
            const { data } = await api.post("/creators/me/broadcast", {
                body,
                media_url: mediaUrl || null,
                media_paywall_coins: mediaUrl ? Number(paywallCoins) || 0 : 0,
            });
            setResult(data);
        } catch (e) {
            setErr(formatApiError(e.response?.data?.detail) || e.message);
        } finally { setLoading(false); }
    };

    if (result) {
        return (
            <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/80 backdrop-blur p-4" data-testid="broadcast-success-modal">
                <div className="w-full max-w-md rounded-2xl border border-magenta/40 bg-surface p-6 text-center">
                    <Megaphone size={36} className="mx-auto text-magenta-200" />
                    <h3 className="mt-3 font-display text-xl font-bold">Message envoyé ✨</h3>
                    <p className="mt-2 text-sm text-white/60">
                        Ton message a été distribué à <span className="font-mono text-magenta-200">{result.count}</span> abonné{result.count > 1 ? "s" : ""} actif{result.count > 1 ? "s" : ""}.
                    </p>
                    <button onClick={() => onClose(true)} className="btn-primary mt-5 w-full justify-center" data-testid="broadcast-close-success">
                        Parfait !
                    </button>
                </div>
            </div>
        );
    }

    return (
        <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/80 backdrop-blur p-4" data-testid="broadcast-modal">
            <form onSubmit={submit} className="w-full max-w-lg max-h-[92vh] overflow-y-auto rounded-2xl border border-white/10 bg-surface p-6">
                <div className="flex items-center justify-between">
                    <h3 className="font-display text-xl font-bold flex items-center gap-2">
                        <Megaphone size={18} className="text-magenta-200" /> Message à tou·te·s mes abonné·e·s
                    </h3>
                    <button type="button" onClick={() => onClose(false)} className="rounded-full p-1 text-white/50 hover:bg-white/5"><X size={16} /></button>
                </div>
                <p className="mt-2 text-sm text-white/60">
                    Envoie un message groupé à l'ensemble de tes fans abonnés. Tu peux joindre une photo/vidéo déverrouillable contre coins.
                </p>

                <div className="mt-5 space-y-4">
                    <div>
                        <label className="text-xs text-white/60">Message</label>
                        <textarea
                            required maxLength={2000} rows={4}
                            className="input-base mt-1 min-h-[100px] resize-none"
                            placeholder="Ex : Nouvelle série exclusive en ligne 💋 — ouvre vite le média !"
                            value={body}
                            onChange={e => setBody(e.target.value)}
                            data-testid="broadcast-body"
                        />
                        <div className="mt-1 text-right text-[11px] text-white/40">{body.length}/2000</div>
                    </div>

                    <div>
                        <label className="text-xs text-white/60">Média (optionnel)</label>
                        <div className="mt-2">
                            <FileUploader
                                value={mediaUrl}
                                onChange={setMediaUrl}
                                label="Joindre une photo ou vidéo"
                                testId="broadcast-uploader"
                            />
                        </div>
                    </div>

                    {mediaUrl && (
                        <div className="rounded-xl border border-magenta/20 bg-magenta/5 p-3">
                            <label className="text-xs font-semibold text-white/80 flex items-center gap-1.5">
                                <Coins size={12} className="text-magenta-200" /> Paywall média (0 = gratuit pour tous)
                            </label>
                            <div className="mt-2 flex gap-2">
                                {[0, 25, 50, 100, 250].map(v => (
                                    <button
                                        type="button" key={v}
                                        onClick={() => setPaywallCoins(v)}
                                        data-testid={`broadcast-paywall-${v}`}
                                        className={`flex-1 rounded-xl border px-2 py-2 font-mono text-sm transition-all ${paywallCoins === v ? "border-magenta bg-magenta/20" : "border-white/10"}`}>
                                        {v === 0 ? "Gratuit" : v}
                                    </button>
                                ))}
                            </div>
                            <input
                                type="number" min={0} max={10000}
                                className="input-base mt-2 font-mono"
                                value={paywallCoins}
                                onChange={e => setPaywallCoins(Number(e.target.value))}
                                data-testid="broadcast-paywall-custom"
                            />
                            <p className="mt-2 text-[11px] text-white/40">
                                Tu touches 80% par déverrouillage — soit {Math.round(Number(paywallCoins) * 0.8)} coins par fan.
                            </p>
                        </div>
                    )}

                    {err && <div className="rounded-lg border border-red-500/30 bg-red-500/10 p-3 text-sm text-red-300" data-testid="broadcast-error">{err}</div>}

                    <button type="submit" disabled={loading || !body.trim()} className="btn-primary w-full justify-center" data-testid="broadcast-submit">
                        <Send size={14} /> {loading ? "Envoi…" : "Envoyer à tous mes abonnés"}
                    </button>
                </div>
            </form>
        </div>
    );
}
