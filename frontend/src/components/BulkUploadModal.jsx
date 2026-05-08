import { useState } from "react";
import { X, Rocket, Loader2 } from "lucide-react";
import { api } from "@/lib/api";
import { formatApiError } from "@/lib/auth";
import MultiFileUploader from "@/components/MultiFileUploader";

/**
 * Bulk post creator: the creator uploads N files at once and each one becomes
 * an individual post sharing the same premium / price / title-prefix settings.
 * Titles are auto-incremented ("Mon post #1", "Mon post #2", ...).
 */
export default function BulkUploadModal({ onClose, onCreated }) {
    const [settings, setSettings] = useState({
        title_prefix: "",
        description: "",
        is_premium: true,
        unlock_price: 0,
        included_in_subscription: true,
    });
    const [uploaded, setUploaded] = useState([]); // [{url, name, is_video}]
    const [created, setCreated] = useState([]); // successfully published content_ids
    const [errors, setErrors] = useState([]);
    const [publishing, setPublishing] = useState(false);

    const publishAll = async () => {
        if (uploaded.length === 0 || publishing) return;
        setPublishing(true); setErrors([]);
        const okList = [];
        const errList = [];
        for (let i = 0; i < uploaded.length; i++) {
            const item = uploaded[i];
            const title = (settings.title_prefix?.trim() || baseNameOf(item.name) || "Post") + ` #${i + 1}`;
            try {
                const payload = {
                    title,
                    description: settings.description,
                    media_url: item.url.replace(/^https?:\/\/[^/]+/, ""), // store relative URL
                    is_premium: settings.is_premium,
                    unlock_price: Number(settings.unlock_price) || 0,
                    included_in_subscription: settings.included_in_subscription,
                    content_type: item.is_video ? "video" : "image",
                };
                const { data } = await api.post("/creators/me/content", payload);
                okList.push(data.content_id);
            } catch (e) {
                errList.push({ name: item.name, error: formatApiError(e.response?.data?.detail) || e.message });
            }
        }
        setCreated(okList); setErrors(errList);
        setPublishing(false);
        if (okList.length > 0) onCreated?.(okList);
    };

    const totalReady = uploaded.length;
    const allPublished = created.length > 0 && created.length + errors.length === totalReady;

    return (
        <div className="fixed inset-0 z-[100] flex items-start justify-center overflow-y-auto bg-black/80 p-4 backdrop-blur-sm"
             role="dialog" aria-modal="true" data-testid="bulk-upload-modal"
             onClick={() => !publishing && onClose?.()}>
            <form onSubmit={(e) => { e.preventDefault(); publishAll(); }}
                  onClick={(e) => e.stopPropagation()}
                  className="my-8 w-full max-w-2xl space-y-4 rounded-2xl border border-white/10 bg-surface p-5 shadow-2xl">
                <div className="flex items-start justify-between gap-3">
                    <div>
                        <div className="overline flex items-center gap-2"><Rocket size={12} /> Upload groupé</div>
                        <div className="mt-1 font-display text-2xl font-bold">Publier plusieurs contenus</div>
                        <p className="mt-1 text-sm text-white/50">Choisis plusieurs photos ou vidéos d'un coup — chacune devient un post avec les réglages ci-dessous.</p>
                    </div>
                    <button type="button" onClick={() => !publishing && onClose?.()}
                            data-testid="bulk-upload-close"
                            className="rounded-full p-1.5 text-white/50 hover:bg-white/5 hover:text-white">
                        <X size={16} />
                    </button>
                </div>

                <div className="rounded-xl border border-white/10 bg-white/[0.02] p-3 space-y-3">
                    <div className="overline">Réglages appliqués à tous</div>
                    <div>
                        <label className="text-xs text-white/60">Préfixe de titre (optionnel)</label>
                        <input className="input-base mt-1" placeholder="Ex: Shooting plage — (auto-numéroté #1, #2, #3)"
                               value={settings.title_prefix}
                               onChange={e => setSettings({ ...settings, title_prefix: e.target.value })}
                               data-testid="bulk-title-prefix" />
                    </div>
                    <div>
                        <label className="text-xs text-white/60">Description commune (optionnel)</label>
                        <textarea className="input-base mt-1 min-h-[60px]" value={settings.description}
                                  onChange={e => setSettings({ ...settings, description: e.target.value })}
                                  data-testid="bulk-description" />
                    </div>
                    <label className="flex items-center gap-2 text-sm text-white/80">
                        <input type="checkbox" checked={settings.is_premium}
                               onChange={e => setSettings({ ...settings, is_premium: e.target.checked })}
                               data-testid="bulk-premium"
                               className="h-4 w-4 accent-magenta" />
                        Contenu premium (payant ou réservé aux abonnés)
                    </label>
                    {settings.is_premium && (
                        <div className="space-y-2">
                            <label className="flex items-start gap-2 text-sm text-white/80">
                                <input type="checkbox" checked={settings.included_in_subscription}
                                       onChange={e => setSettings({ ...settings, included_in_subscription: e.target.checked })}
                                       data-testid="bulk-included-sub"
                                       className="mt-0.5 h-4 w-4 accent-magenta" />
                                <span>Inclus dans l'abonnement (gratuit pour les abonnés)</span>
                            </label>
                            <div>
                                <label className="text-xs text-white/60">Prix à l'unité (€, 0 = abonnés uniquement)</label>
                                <input className="input-base mt-1" type="number" min="0" step="0.01" value={settings.unlock_price}
                                       onChange={e => setSettings({ ...settings, unlock_price: e.target.value })}
                                       data-testid="bulk-price" />
                            </div>
                        </div>
                    )}
                </div>

                <MultiFileUploader
                    disabled={publishing}
                    onItemDone={(it) => setUploaded(prev => [...prev, it])}
                />

                {errors.length > 0 && (
                    <div className="space-y-1 rounded-lg border border-red-500/30 bg-red-500/10 p-3" data-testid="bulk-errors">
                        <div className="text-sm font-semibold text-red-200">{errors.length} échec{errors.length > 1 ? "s" : ""} à la publication</div>
                        {errors.map((e, i) => (
                            <div key={i} className="text-[11px] text-red-300">• {e.name}: {e.error}</div>
                        ))}
                    </div>
                )}

                {allPublished && (
                    <div className="rounded-lg border border-green-500/30 bg-green-500/10 p-3 text-sm text-green-200" data-testid="bulk-success">
                        ✓ {created.length} publication{created.length > 1 ? "s" : ""} créée{created.length > 1 ? "s" : ""} avec succès !
                    </div>
                )}

                <div className="flex items-center justify-between gap-3 border-t border-white/5 pt-4">
                    <div className="text-xs text-white/50">
                        {totalReady > 0 ? `${totalReady} fichier${totalReady > 1 ? "s" : ""} prêt${totalReady > 1 ? "s" : ""}` : "Aucun fichier uploadé"}
                    </div>
                    <div className="flex gap-2">
                        <button type="button" onClick={() => !publishing && onClose?.()}
                                data-testid="bulk-cancel-btn"
                                className="rounded-full border border-white/10 bg-white/[0.03] px-4 py-2 text-sm text-white/80 hover:bg-white/[0.08]">
                            Fermer
                        </button>
                        <button type="submit" disabled={publishing || totalReady === 0}
                                data-testid="bulk-publish-btn"
                                className="btn-primary">
                            {publishing ? <><Loader2 size={14} className="animate-spin" /> Publication…</> : <><Rocket size={14} /> Publier les {totalReady}</>}
                        </button>
                    </div>
                </div>
            </form>
        </div>
    );
}

function baseNameOf(filename) {
    return (filename || "").replace(/\.[a-z0-9]+$/i, "").replace(/[_-]+/g, " ").trim();
}
