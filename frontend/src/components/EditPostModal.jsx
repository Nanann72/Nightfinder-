import { useState } from "react";
import { X, Save, Loader2 } from "lucide-react";
import { api } from "@/lib/api";
import { formatApiError } from "@/lib/auth";

/**
 * Edit an existing post — media_url is immutable (create a new post for a new file).
 * Creator can change title, description, premium/price, included-in-sub, schedule, 24h expiry.
 */
export default function EditPostModal({ post, onClose, onSaved }) {
    const hasSchedule = !!post?.scheduled_at && new Date(post.scheduled_at) > new Date();
    const has24h = !!post?.expires_at;
    const [form, setForm] = useState({
        title: post?.title || "",
        description: post?.description || "",
        is_premium: !!post?.is_premium,
        unlock_price: String(post?.unlock_price ?? 0),
        included_in_subscription: !!post?.included_in_subscription,
        schedule: hasSchedule,
        scheduled_at: hasSchedule ? new Date(post.scheduled_at).toISOString().slice(0, 16) : "",
        is_24h: has24h,
    });
    const [err, setErr] = useState("");
    const [loading, setLoading] = useState(false);

    const submit = async (e) => {
        e.preventDefault(); setErr(""); setLoading(true);
        try {
            const payload = {
                title: form.title,
                description: form.description,
                is_premium: form.is_premium,
                unlock_price: Number(form.unlock_price) || 0,
                included_in_subscription: form.included_in_subscription,
            };
            if (form.schedule && form.scheduled_at) {
                const d = new Date(form.scheduled_at);
                if (isNaN(d.getTime())) { setErr("Date invalide"); setLoading(false); return; }
                payload.scheduled_at = d.toISOString();
            } else if (!form.schedule) {
                payload.scheduled_at = "";
            }
            if (form.is_24h && !has24h) {
                payload.expires_in_hours = 24;
            } else if (!form.is_24h && has24h) {
                payload.expires_in_hours = -1; // clear
            }
            const { data } = await api.patch(`/creators/me/content/${post.content_id}`, payload);
            onSaved?.(data);
            onClose();
        } catch (e) {
            setErr(formatApiError(e.response?.data?.detail) || e.message);
        } finally { setLoading(false); }
    };

    return (
        <div className="fixed inset-0 z-[100] flex items-center justify-center bg-black/80 p-4 backdrop-blur-sm"
             role="dialog" aria-modal="true" data-testid="edit-post-modal"
             onClick={() => !loading && onClose?.()}>
            <form onSubmit={submit}
                  onClick={(e) => e.stopPropagation()}
                  className="w-full max-w-lg space-y-4 rounded-2xl border border-white/10 bg-surface p-5 shadow-2xl">
                <div className="flex items-start justify-between gap-3">
                    <div>
                        <div className="overline">Modifier la publication</div>
                        <div className="mt-1 font-display text-xl font-bold">Éditer ce post</div>
                    </div>
                    <button type="button" onClick={() => !loading && onClose?.()}
                            data-testid="edit-post-close"
                            className="rounded-full p-1.5 text-white/50 hover:bg-white/5 hover:text-white">
                        <X size={16} />
                    </button>
                </div>

                <div className="rounded-xl border border-white/5 bg-white/[0.02] p-2">
                    <img src={post.media_url} alt={post.title}
                         className="h-40 w-full rounded-lg object-cover" />
                </div>

                <input className="input-base" required placeholder="Titre" value={form.title}
                       onChange={e => setForm({ ...form, title: e.target.value })}
                       data-testid="edit-post-title" />
                <textarea className="input-base min-h-[80px]" placeholder="Description (optionnel)"
                          value={form.description}
                          onChange={e => setForm({ ...form, description: e.target.value })}
                          data-testid="edit-post-description" />

                <label className="flex items-center gap-2 text-sm text-white/80">
                    <input type="checkbox" checked={form.is_premium}
                           onChange={e => setForm({ ...form, is_premium: e.target.checked })}
                           data-testid="edit-post-premium"
                           className="h-4 w-4 accent-magenta" />
                    Contenu premium (payant ou réservé aux abonnés)
                </label>

                {form.is_premium && (
                    <div className="space-y-3 rounded-xl border border-white/10 bg-white/[0.02] p-3">
                        <label className="flex items-start gap-2 text-sm text-white/80">
                            <input type="checkbox" checked={form.included_in_subscription}
                                   onChange={e => setForm({ ...form, included_in_subscription: e.target.checked })}
                                   data-testid="edit-post-included-sub"
                                   className="mt-0.5 h-4 w-4 accent-magenta" />
                            <span>
                                Inclus dans l'abonnement
                                <span className="block text-[11px] text-white/50">Les abonnés voient ce contenu gratuitement.</span>
                            </span>
                        </label>
                        <div>
                            <label className="text-xs text-white/60">Prix à l'unité (€, 0 = abonnés uniquement)</label>
                            <input className="input-base mt-1" type="number" min="0" step="0.01"
                                   value={form.unlock_price}
                                   onChange={e => setForm({ ...form, unlock_price: e.target.value })}
                                   data-testid="edit-post-price" />
                        </div>
                    </div>
                )}

                <div className="space-y-3 rounded-xl border border-white/10 bg-white/[0.02] p-3">
                    <label className="flex items-start gap-2 text-sm text-white/80">
                        <input type="checkbox" checked={form.schedule}
                               onChange={e => setForm({ ...form, schedule: e.target.checked })}
                               data-testid="edit-post-schedule-toggle"
                               className="mt-0.5 h-4 w-4 accent-magenta" />
                        <span>Planifier la publication</span>
                    </label>
                    {form.schedule && (
                        <input type="datetime-local"
                               className="input-base font-mono text-sm"
                               value={form.scheduled_at}
                               onChange={e => setForm({ ...form, scheduled_at: e.target.value })}
                               data-testid="edit-post-scheduled-at" />
                    )}
                    <label className="flex items-start gap-2 border-t border-white/5 pt-3 text-sm text-white/80">
                        <input type="checkbox" checked={form.is_24h}
                               onChange={e => setForm({ ...form, is_24h: e.target.checked })}
                               data-testid="edit-post-24h-toggle"
                               className="mt-0.5 h-4 w-4 accent-magenta" />
                        <span>Expire dans 24 heures</span>
                    </label>
                </div>

                {err && <div className="rounded-lg border border-red-500/30 bg-red-500/10 p-2.5 text-sm text-red-300" data-testid="edit-post-error">{err}</div>}

                <button type="submit" disabled={loading || !form.title}
                        data-testid="edit-post-submit"
                        className="btn-primary w-full justify-center">
                    {loading ? <Loader2 size={16} className="animate-spin" /> : <Save size={16} />}
                    {loading ? "Enregistrement…" : "Enregistrer"}
                </button>
            </form>
        </div>
    );
}
