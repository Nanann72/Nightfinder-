import { useEffect, useState } from "react";
import { Link, useNavigate } from "react-router-dom";
import { useTranslation } from "react-i18next";
import { api } from "@/lib/api";
import { useAuth } from "@/lib/auth";
import { Lock, Heart, MessageCircle, Sparkles, X, Coins, Bookmark, Share2, MoreHorizontal, Plus } from "lucide-react";
import { avatarUrl, onAvatarError } from "@/lib/avatars";
import { toast } from "sonner";

/**
 * Fanvue-style single-column feed.
 * Stories at top, then a vertical stack of post cards (max-width 600px).
 */
export default function Feed() {
    const { user } = useAuth();
    const { t } = useTranslation();
    const nav = useNavigate();
    const [items, setItems] = useState([]);
    const [stories, setStories] = useState([]);
    const [activeStories, setActiveStories] = useState(null);
    const [storyIdx, setStoryIdx] = useState(0);
    const [filter, setFilter] = useState("all"); // all | subscribed

    const load = async () => {
        try {
            const [feedR, storiesR] = await Promise.all([
                api.get("/feed", { params: { limit: 30 } }),
                api.get("/stories"),
            ]);
            setItems(feedR.data);
            setStories(storiesR.data);
        } catch {}
    };

    useEffect(() => { load(); }, []);

    const tryUnlock = async (item) => {
        if (!user) return nav("/login");
        if (!user.age_verified) return nav("/verification");
        if (item.unlock_price > 0) {
            try {
                await api.post("/payments/unlock", { content_id: item.content_id });
                await load();
            } catch (e) {
                const detail = e.response?.data?.detail;
                if (detail?.error === "insufficient_coins") nav("/wallet");
            }
        } else {
            nav(`/createur/${item.creator.creator_id}`);
        }
    };

    const filtered = filter === "subscribed"
        ? items.filter(i => i.is_unlocked)
        : items;

    return (
        <div className="mx-auto w-full max-w-[600px] py-3 sm:py-6" data-testid="feed-container">
            {/* Header — sticky tabs */}
            <header className="sticky top-0 z-20 -mx-3 mb-3 border-b border-white/[0.06] bg-[var(--bg-base)]/90 px-3 py-2 backdrop-blur sm:-mx-6 sm:mb-4 sm:px-6 sm:py-3">
                <div className="flex items-center gap-1">
                    <TabPill active={filter === "all"} onClick={() => setFilter("all")} testId="feed-tab-all">
                        {t("feed.title") || "Pour toi"}
                    </TabPill>
                    <TabPill active={filter === "subscribed"} onClick={() => setFilter("subscribed")} testId="feed-tab-subs">
                        Abonnements
                    </TabPill>
                </div>
            </header>

            {/* Stories bar */}
            <section className="mb-4 sm:mb-6" data-testid="stories-bar">
                <div className="flex gap-2.5 overflow-x-auto pb-2 -mx-1 px-1 scrollbar-thin sm:gap-3">
                    {/* Add your story */}
                    {user?.role === "creator" && (
                        <button
                            data-testid="story-add"
                            onClick={() => nav("/dashboard")}
                            className="group flex shrink-0 flex-col items-center gap-1.5"
                        >
                            <span className="relative flex h-14 w-14 items-center justify-center rounded-full border-2 border-dashed border-magenta/40 bg-magenta/5 transition-colors group-hover:border-magenta sm:h-16 sm:w-16">
                                <Plus size={18} className="text-magenta-200" />
                            </span>
                            <span className="max-w-[58px] truncate text-[10px] text-white/55 sm:max-w-[64px] sm:text-[11px]">Ta story</span>
                        </button>
                    )}
                    {stories.length === 0 && user?.role !== "creator" && (
                        <div className="text-sm text-white/40 px-2 py-6" data-testid="stories-empty">
                            {t("feed.stories.empty") || "Aucune story active pour le moment."}
                        </div>
                    )}
                    {stories.map((s) => (
                        <button
                            key={s.creator_id}
                            data-testid={`story-${s.creator_id}`}
                            onClick={() => { setActiveStories(s); setStoryIdx(0); }}
                            className="group flex shrink-0 flex-col items-center gap-1.5"
                        >
                            <span className="rounded-full bg-gradient-to-br from-magenta via-pink-500 to-magenta-400 p-[2px] transition-transform group-hover:scale-105 sm:p-[2.5px]">
                                <span className="block rounded-full bg-[var(--bg-base)] p-[2px]">
                                    <img src={avatarUrl(s)} alt={s.display_name} onError={onAvatarError}
                                         className="h-12 w-12 rounded-full object-cover sm:h-14 sm:w-14" />
                                </span>
                            </span>
                            <span className="max-w-[58px] truncate text-[10px] text-white/70 sm:max-w-[64px] sm:text-[11px]">{s.display_name}</span>
                        </button>
                    ))}
                </div>
            </section>

            {/* Feed posts — single column */}
            <section className="space-y-5" data-testid="feed-grid">
                {filtered.length === 0 ? (
                    <div className="rounded-3xl border border-white/[0.06] bg-[var(--bg-surface)] p-10 text-center">
                        <Sparkles size={28} className="mx-auto text-magenta-300" />
                        <h3 className="mt-3 font-display text-lg font-semibold">Ton fil est calme</h3>
                        <p className="mt-1 text-sm text-white/55">Découvre de nouvelles créatrices pour remplir ton feed.</p>
                        <Link to="/createurs" className="btn-primary mt-5 inline-flex">Explorer</Link>
                    </div>
                ) : filtered.map((it) => (
                    <PostCard key={it.content_id} item={it} onUnlock={() => tryUnlock(it)} t={t} />
                ))}
            </section>

            {activeStories && (
                <StoryViewer
                    bundle={activeStories}
                    idx={storyIdx}
                    onIdx={setStoryIdx}
                    onClose={() => setActiveStories(null)}
                />
            )}
        </div>
    );
}

function TabPill({ active, onClick, testId, children }) {
    return (
        <button
            onClick={onClick}
            data-testid={testId}
            className={`relative rounded-full px-5 py-2 text-sm font-semibold transition-all ${
                active
                    ? "bg-magenta/15 text-white"
                    : "text-white/55 hover:bg-white/[0.04] hover:text-white"
            }`}
        >
            {children}
            {active && <span className="absolute inset-x-3 -bottom-3 h-0.5 rounded-full bg-magenta" />}
        </button>
    );
}

function PostCard({ item, onUnlock, t }) {
    const [liked, setLiked] = useState(!!item.is_liked);
    const [likesCount, setLikesCount] = useState(item.likes_count || 0);
    const [bookmarked, setBookmarked] = useState(!!item.is_bookmarked);
    const [busy, setBusy] = useState(false);

    const toggleLike = async () => {
        if (busy) return;
        setBusy(true);
        const next = !liked;
        setLiked(next);
        setLikesCount(c => Math.max(0, c + (next ? 1 : -1)));
        try {
            const { data } = next
                ? await api.post(`/content/${item.content_id}/like`)
                : await api.delete(`/content/${item.content_id}/like`);
            setLikesCount(data.likes_count);
        } catch {
            // Revert on error
            setLiked(!next);
            setLikesCount(c => Math.max(0, c + (next ? -1 : 1)));
        } finally { setBusy(false); }
    };

    const toggleBookmark = async () => {
        const next = !bookmarked;
        setBookmarked(next);
        try {
            await (next
                ? api.post(`/content/${item.content_id}/bookmark`)
                : api.delete(`/content/${item.content_id}/bookmark`));
        } catch { setBookmarked(!next); }
    };

    const sharePost = async () => {
        const url = `${window.location.origin}/c/${item.creator.handle}`;
        if (navigator.share) {
            try { await navigator.share({ title: item.creator.display_name, url }); return; } catch {}
        }
        try {
            await navigator.clipboard.writeText(url);
            toast.success("Lien copié ✓");
        } catch {
            toast.error("Impossible de copier le lien");
        }
    };

    return (
        <article
            data-testid={`feed-item-${item.content_id}`}
            className="overflow-hidden rounded-3xl border border-white/[0.06] bg-[var(--bg-surface)] transition-colors hover:border-white/10"
        >
            {/* Author row */}
            <div className="flex items-center gap-3 p-4">
                <Link to={`/createur/${item.creator.creator_id}`} className="shrink-0">
                    <img
                        src={avatarUrl(item.creator)}
                        alt={item.creator.display_name || item.creator.handle || "?"}
                        onError={onAvatarError}
                        className="h-11 w-11 rounded-2xl border border-white/10 object-cover"
                    />
                </Link>
                <Link to={`/createur/${item.creator.creator_id}`} className="flex-1 min-w-0">
                    <div className="truncate text-sm font-semibold text-white">{item.creator.display_name}</div>
                    <div className="truncate text-xs text-white/40">@{item.creator.handle}</div>
                </Link>
                <Link
                    to={`/createur/${item.creator.creator_id}`}
                    className="rounded-full p-1.5 text-white/40 hover:bg-white/[0.04] hover:text-white"
                    aria-label="Voir le profil"
                    data-testid={`feed-profile-${item.content_id}`}
                >
                    <MoreHorizontal size={18} />
                </Link>
            </div>

            {/* Media */}
            <div className="relative aspect-[4/5] overflow-hidden bg-[var(--bg-elevated)]">
                <Link
                    to={item.is_unlocked ? `/createur/${item.creator.creator_id}` : "#"}
                    onClick={(e) => { if (!item.is_unlocked) { e.preventDefault(); onUnlock(); } }}
                    className="block h-full w-full"
                    data-testid={`feed-media-${item.content_id}`}
                >
                    <img
                        src={item.media_url}
                        alt={item.title}
                        className={`h-full w-full object-cover transition ${item.is_unlocked ? "" : "scale-110 blur-3xl"}`}
                    />
                </Link>
                {!item.is_unlocked && (
                    <button
                        onClick={onUnlock}
                        data-testid={`feed-unlock-${item.content_id}`}
                        className="absolute inset-0 flex flex-col items-center justify-center gap-3 bg-gradient-to-b from-black/40 via-black/55 to-black/70"
                    >
                        <span className="flex h-14 w-14 items-center justify-center rounded-full border border-magenta/40 bg-magenta/20 backdrop-blur-md">
                            <Lock size={20} className="text-magenta-200" />
                        </span>
                        {item.unlock_price > 0 ? (
                            <span className="inline-flex items-center gap-2 rounded-full bg-gradient-to-r from-magenta to-magenta-dark px-6 py-3 text-sm font-bold text-white shadow-lg shadow-magenta/30">
                                <Coins size={14} /> {t("feed.unlock") || "Débloquer"} · {Math.round(item.unlock_price * 10)} coins
                            </span>
                        ) : (
                            <span className="inline-flex items-center gap-2 rounded-full border border-white/20 bg-white/5 px-5 py-2.5 text-sm font-semibold text-white backdrop-blur-md">
                                <Sparkles size={13} /> {t("feed.subscribed_only") || "Réservé aux abonné·e·s"}
                            </span>
                        )}
                    </button>
                )}
            </div>

            {/* Action bar */}
            <div className="flex items-center justify-between px-4 py-3">
                <div className="flex items-center gap-1">
                    <ActionBtn onClick={toggleLike} active={liked} testId={`feed-like-${item.content_id}`}
                               label={likesCount > 0 ? String(likesCount) : null}>
                        <Heart size={20} className={liked ? "fill-magenta text-magenta" : ""} />
                    </ActionBtn>
                    <ActionBtn linkTo={`/messages?creator=${item.creator.creator_id}`} testId={`feed-comment-${item.content_id}`}>
                        <MessageCircle size={20} />
                    </ActionBtn>
                    <ActionBtn linkTo={`/createur/${item.creator.creator_id}#tip`} testId={`feed-tip-${item.content_id}`}>
                        <Coins size={19} />
                    </ActionBtn>
                    <ActionBtn onClick={sharePost} testId={`feed-share-${item.content_id}`}>
                        <Share2 size={18} />
                    </ActionBtn>
                </div>
                <ActionBtn onClick={toggleBookmark} active={bookmarked} testId={`feed-bookmark-${item.content_id}`}>
                    <Bookmark size={19} className={bookmarked ? "fill-magenta-200 text-magenta-200" : ""} />
                </ActionBtn>
            </div>

            {/* Caption */}
            {(item.title || item.description) && (
                <div className="px-4 pb-4 text-sm text-white/85">
                    <Link to={`/createur/${item.creator.creator_id}`} className="font-semibold text-white hover:text-magenta-200">@{item.creator.handle}</Link>{" "}
                    {item.title}
                    {item.description && <span className="text-white/65"> — {item.description}</span>}
                </div>
            )}
        </article>
    );
}

function ActionBtn({ children, onClick, linkTo, active, testId, label }) {
    const cls = `flex h-10 items-center gap-1.5 rounded-full px-2.5 transition-colors ${
        active ? "bg-magenta/10 text-magenta-200" : "text-white/65 hover:bg-white/[0.05] hover:text-white"
    }`;
    if (linkTo) return <Link to={linkTo} className={cls} data-testid={testId}>{children}{label && <span className="text-xs font-semibold tabular-nums">{label}</span>}</Link>;
    return <button onClick={onClick} className={cls} data-testid={testId}>{children}{label && <span className="text-xs font-semibold tabular-nums">{label}</span>}</button>;
}

function StoryViewer({ bundle, idx, onIdx, onClose }) {
    const story = bundle.stories[idx];
    useEffect(() => {
        const t = setTimeout(() => {
            if (idx + 1 < bundle.stories.length) onIdx(idx + 1);
            else onClose();
        }, 5000);
        return () => clearTimeout(t);
    }, [idx, bundle, onIdx, onClose]);

    return (
        <div data-testid="story-viewer" className="fixed inset-0 z-[80] flex items-center justify-center bg-black/95 p-4">
            <button onClick={onClose} data-testid="story-close"
                    className="absolute right-4 top-4 rounded-full border border-white/10 bg-black/60 p-2 text-white/70 hover:text-white">
                <X size={16} />
            </button>
            <div className="relative w-full max-w-md">
                <div className="mb-3 flex gap-1">
                    {bundle.stories.map((_, i) => (
                        <div key={i} className={`h-0.5 flex-1 rounded ${i < idx ? "bg-white" : i === idx ? "bg-magenta" : "bg-white/20"}`} />
                    ))}
                </div>
                <div className="mb-3 flex items-center gap-3">
                    <img src={avatarUrl(bundle)} alt={bundle.display_name || ""} onError={onAvatarError} className="h-9 w-9 rounded-full" />
                    <div>
                        <div className="text-sm font-semibold">{bundle.display_name}</div>
                        <div className="text-xs text-white/40">@{bundle.handle}</div>
                    </div>
                </div>
                <div className="overflow-hidden rounded-2xl border border-white/10 bg-surface">
                    <img src={story.media_url} alt="" className="w-full object-cover" />
                    {story.caption && (
                        <div className="p-3 text-sm text-white/80">{story.caption}</div>
                    )}
                </div>
            </div>
        </div>
    );
}
