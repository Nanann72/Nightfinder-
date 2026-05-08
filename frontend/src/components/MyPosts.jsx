import { useCallback, useEffect, useState } from "react";
import { Trash2, Pencil, Lock, Eye, Heart, Calendar, Clock, Loader2 } from "lucide-react";
import { api } from "@/lib/api";
import { useAuth, formatApiError } from "@/lib/auth";
import ConfirmDialog from "@/components/ConfirmDialog";
import EditPostModal from "@/components/EditPostModal";

/**
 * Creator's own post list with a delete button for each card.
 * Uses `GET /api/creators/{user_id}` (owner view returns all posts, including scheduled)
 * and `DELETE /api/creators/me/content/{id}` (cascades unlocks + likes).
 */
export default function MyPosts({ reloadSignal = 0 }) {
    const { user } = useAuth();
    const [posts, setPosts] = useState([]);
    const [loading, setLoading] = useState(true);
    const [err, setErr] = useState("");
    const [toDelete, setToDelete] = useState(null);
    const [deleting, setDeleting] = useState(false);
    const [toEdit, setToEdit] = useState(null);

    const load = useCallback(async () => {
        if (!user) return;
        setLoading(true); setErr("");
        try {
            const { data } = await api.get(`/creators/${user.user_id}`);
            setPosts(data?.content || []);
        } catch (e) {
            setErr(formatApiError(e.response?.data?.detail) || e.message);
        } finally { setLoading(false); }
    }, [user]);

    useEffect(() => { load(); }, [load, reloadSignal]);

    const confirmDelete = async () => {
        if (!toDelete) return;
        setDeleting(true);
        try {
            await api.delete(`/creators/me/content/${toDelete.content_id}`);
            setPosts(p => p.filter(c => c.content_id !== toDelete.content_id));
            setToDelete(null);
        } catch (e) {
            setErr(formatApiError(e.response?.data?.detail) || e.message);
        } finally { setDeleting(false); }
    };

    const fmtDate = (iso) => {
        try {
            const d = new Date(iso);
            return d.toLocaleDateString("fr-FR", { day: "2-digit", month: "short", year: "numeric" });
        } catch { return ""; }
    };

    return (
        <div className="mt-8 surface-card" data-testid="my-posts-card">
            <div className="flex items-center justify-between gap-3">
                <div>
                    <div className="overline">Mes publications</div>
                    <div className="mt-1 font-display text-xl font-bold sm:text-2xl">
                        {posts.length} {posts.length > 1 ? "posts" : "post"}
                    </div>
                </div>
                {loading && <Loader2 size={16} className="animate-spin text-white/40" />}
            </div>

            {err && <div className="mt-3 rounded-lg border border-red-500/30 bg-red-500/10 p-3 text-sm text-red-300" data-testid="my-posts-error">{err}</div>}

            {!loading && posts.length === 0 && !err && (
                <div className="mt-6 rounded-xl border border-white/5 bg-white/[0.01] p-8 text-center text-sm text-white/40" data-testid="my-posts-empty">
                    Aucune publication pour le moment. Clique sur <strong className="text-white/70">Nouveau post</strong> pour partager tes premiers contenus.
                </div>
            )}

            {posts.length > 0 && (
                <div className="mt-5 grid gap-3 sm:grid-cols-2 lg:grid-cols-3 xl:grid-cols-4">
                    {posts.map((p) => {
                        const scheduled = p.scheduled_at && new Date(p.scheduled_at) > new Date();
                        const expiresAt = p.expires_at ? new Date(p.expires_at) : null;
                        const expired = expiresAt && expiresAt <= new Date();
                        return (
                            <div key={p.content_id}
                                 data-testid={`my-post-${p.content_id}`}
                                 className="group relative overflow-hidden rounded-xl border border-white/10 bg-black/40">
                                <div className="relative aspect-[4/5]">
                                    <img src={p.media_url} alt={p.title}
                                         className="h-full w-full object-cover transition-transform duration-500 group-hover:scale-105" />
                                    {/* Status pills */}
                                    <div className="pointer-events-none absolute left-2 top-2 flex flex-col items-start gap-1">
                                        {scheduled && (
                                            <span className="inline-flex items-center gap-1 rounded-full border border-amber-400/40 bg-amber-500/25 px-2 py-0.5 text-[10px] font-bold uppercase tracking-wider text-amber-200 backdrop-blur-sm">
                                                <Calendar size={10} /> Programmé
                                            </span>
                                        )}
                                        {expiresAt && !expired && (
                                            <span className="inline-flex items-center gap-1 rounded-full border border-amber-400/40 bg-amber-500/25 px-2 py-0.5 text-[10px] font-bold uppercase tracking-wider text-amber-200 backdrop-blur-sm">
                                                <Clock size={10} /> Expire bientôt
                                            </span>
                                        )}
                                        {p.is_premium && (
                                            <span className="inline-flex items-center gap-1 rounded-full border border-magenta/40 bg-magenta/25 px-2 py-0.5 text-[10px] font-bold uppercase tracking-wider text-magenta-200 backdrop-blur-sm">
                                                <Lock size={10} /> {p.included_in_subscription && (p.unlock_price || 0) <= 0 ? "Abonnés" : `${Math.round((p.unlock_price || 0) * 10)} coins`}
                                            </span>
                                        )}
                                    </div>
                                    {/* Edit + Delete buttons */}
                                    <div className="absolute right-2 top-2 z-10 flex items-center gap-1.5 opacity-0 transition-opacity group-hover:opacity-100 focus-within:opacity-100">
                                        <button
                                            type="button"
                                            onClick={() => setToEdit(p)}
                                            data-testid={`edit-post-btn-${p.content_id}`}
                                            aria-label={`Modifier ${p.title}`}
                                            className="inline-flex h-8 w-8 items-center justify-center rounded-full border border-magenta/40 bg-magenta/20 text-magenta-200 transition-colors hover:bg-magenta/40 hover:text-white"
                                        >
                                            <Pencil size={13} />
                                        </button>
                                        <button
                                            type="button"
                                            onClick={() => setToDelete(p)}
                                            data-testid={`delete-post-btn-${p.content_id}`}
                                            aria-label={`Supprimer ${p.title}`}
                                            className="inline-flex h-8 w-8 items-center justify-center rounded-full border border-red-400/40 bg-red-500/20 text-red-200 transition-colors hover:bg-red-500/40 hover:text-white"
                                        >
                                            <Trash2 size={14} />
                                        </button>
                                    </div>
                                    {/* Bottom info */}
                                    <div className="pointer-events-none absolute inset-x-0 bottom-0 space-y-1 bg-gradient-to-t from-black/85 to-transparent p-2.5">
                                        <div className="truncate text-xs font-semibold">{p.title}</div>
                                        <div className="flex items-center justify-between text-[10px] text-white/70">
                                            <span className="inline-flex items-center gap-1"><Heart size={10} /> {p.likes_count || 0}</span>
                                            <span className="inline-flex items-center gap-1"><Eye size={10} /> {p.views_count || 0}</span>
                                            <span>{fmtDate(p.created_at)}</span>
                                        </div>
                                    </div>
                                </div>
                            </div>
                        );
                    })}
                </div>
            )}

            <ConfirmDialog
                open={!!toDelete}
                title="Supprimer cette publication ?"
                message={toDelete ? `"${toDelete.title}" sera supprimé définitivement, ainsi que tous les likes et déverrouillages associés. Cette action est irréversible.` : ""}
                confirmLabel={deleting ? "Suppression…" : "Supprimer"}
                cancelLabel="Annuler"
                destructive
                loading={deleting}
                onConfirm={confirmDelete}
                onClose={() => !deleting && setToDelete(null)}
                testId="delete-post-dialog"
            />

            {toEdit && (
                <EditPostModal
                    post={toEdit}
                    onClose={() => setToEdit(null)}
                    onSaved={(updated) => {
                        setPosts(prev => prev.map(p => p.content_id === updated.content_id ? { ...p, ...updated } : p));
                    }}
                />
            )}
        </div>
    );
}
