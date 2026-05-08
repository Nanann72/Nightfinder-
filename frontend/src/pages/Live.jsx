import { useEffect, useState, useCallback } from "react";
import { Link } from "react-router-dom";
import { useTranslation } from "react-i18next";
import { api } from "@/lib/api";
import { useAuth } from "@/lib/auth";
import { Radio, Users, Eye, Coins, Video, Sparkles, Heart, RefreshCw, TrendingUp, Star, Zap } from "lucide-react";

export default function Live() {
    const { user } = useAuth();
    const { t } = useTranslation();
    const GENDER_TABS = [
        { id: "girls", label: t("gender.girls") },
        { id: "couples", label: t("gender.couples") },
        { id: "trans", label: t("gender.trans") },
        { id: "men", label: t("gender.men") },
    ];
    const SORT_OPTIONS = [
        { id: "popular", label: t("sort.popular"), icon: TrendingUp },
        { id: "trending", label: t("sort.trending"), icon: Zap },
        { id: "top", label: t("sort.top"), icon: Star },
        { id: "new", label: t("sort.new"), icon: Sparkles },
    ];
    const [lives, setLives] = useState([]);
    const [cams, setCams] = useState([]);
    const [favorites, setFavorites] = useState([]);
    const [gender, setGender] = useState("girls");
    const [sort, setSort] = useState("popular");
    const [showFavorites, setShowFavorites] = useState(false);
    const [loading, setLoading] = useState(true);
    const [loadingCams, setLoadingCams] = useState(true);
    const [refreshing, setRefreshing] = useState(false);
    const [lastRefresh, setLastRefresh] = useState(0);
    const isCreator = user?.role === "creator";

    const loadLives = useCallback(async () => {
        try {
            const { data } = await api.get("/live/active");
            setLives(data);
        } catch { /* noop */ }
        finally { setLoading(false); }
    }, []);

    const loadCams = useCallback(async (g, s, silent = false) => {
        if (!silent) setLoadingCams(true);
        setRefreshing(true);
        try {
            const { data } = await api.get(`/cams?limit=30&gender=${encodeURIComponent(g)}&sort=${encodeURIComponent(s)}`);
            setCams(data.items || []);
            setLastRefresh(Date.now());
        } catch { if (!silent) setCams([]); }
        finally { setLoadingCams(false); setRefreshing(false); }
    }, []);

    const loadFavorites = useCallback(async () => {
        if (!user) { setFavorites([]); return; }
        try {
            const { data } = await api.get("/cams/favorites");
            setFavorites(data.items || []);
        } catch { setFavorites([]); }
    }, [user]);

    useEffect(() => {
        loadLives();
        const t = setInterval(loadLives, 12000);
        return () => clearInterval(t);
    }, [loadLives]);

    // Cams real-time refresh: 15s poll
    useEffect(() => {
        loadCams(gender, sort);
        const t = setInterval(() => loadCams(gender, sort, true), 15000);
        return () => clearInterval(t);
    }, [gender, sort, loadCams]);

    useEffect(() => { loadFavorites(); }, [loadFavorites]);

    // Toggle favorite
    const toggleFav = async (ev, username, currentlyFav) => {
        ev.preventDefault(); ev.stopPropagation();
        if (!user) {
            window.location.href = `/login?next=${encodeURIComponent("/live")}`;
            return;
        }
        // Optimistic UI
        setCams(prev => prev.map(c => c.username === username ? { ...c, is_favorite: !currentlyFav } : c));
        try {
            if (currentlyFav) await api.delete(`/cams/favorites/${encodeURIComponent(username)}`);
            else await api.post(`/cams/favorites/${encodeURIComponent(username)}`);
            loadFavorites();
        } catch {
            // rollback
            setCams(prev => prev.map(c => c.username === username ? { ...c, is_favorite: currentlyFav } : c));
        }
    };

    const visibleCams = showFavorites ? favorites : cams;

    return (
        <div className="relative z-10 container-mx py-8">
            <div className="flex items-center justify-between gap-3 flex-wrap">
                <div>
                    <div className="overline flex items-center gap-2">
                        <Radio size={12} className="text-red-400 animate-pulse" /> {t("live.eyebrow")}
                    </div>
                    <h1 className="mt-2 font-display text-3xl font-bold sm:text-4xl">{t("live.title")}</h1>
                    <p className="mt-2 text-sm text-white/50">
                        {t("live.subtitle")}
                    </p>
                </div>
                {isCreator && (
                    <Link to="/live/start" data-testid="go-live-btn" className="btn-primary">
                        <Video size={16} /> {t("live.go_live")}
                    </Link>
                )}
            </div>

            {/* Internal creator lives */}
            <section className="mt-8">
                <div className="flex items-center gap-2">
                    <Sparkles size={14} className="text-magenta-400" />
                    <div className="overline">{t("live.my_creators")} — {t("live.live_count", { count: lives.length })}</div>
                </div>
                {loading ? (
                    <div className="mt-4 text-sm text-white/40" data-testid="live-loading">{t("action.loading")}</div>
                ) : lives.length === 0 ? (
                    <div className="mt-4 surface-card p-8 text-center" data-testid="live-empty">
                        <div className="text-sm text-white/50">
                            {isCreator ? t("live.empty.creator") : t("live.empty.fan")}
                        </div>
                    </div>
                ) : (
                    <div className="mt-4 grid gap-4 sm:grid-cols-2 lg:grid-cols-3">
                        {lives.map(l => (
                            <Link key={l.session_id} to={`/live/${l.session_id}`}
                                  data-testid={`live-card-${l.session_id}`}
                                  className="group surface-card !p-0 overflow-hidden transition-all hover:border-magenta/40">
                                <div className="relative aspect-video bg-gradient-to-br from-magenta/30 to-obsidian">
                                    {(l.preview_url || l.creator_avatar) && <img src={l.preview_url || l.creator_avatar} alt="" className="h-full w-full object-cover transition-transform group-hover:scale-105" />}
                                    {/* Subtle dark gradient at top so badges remain legible over the snapshot. */}
                                    <div className="pointer-events-none absolute inset-x-0 top-0 h-16 bg-gradient-to-b from-black/40 to-transparent" />
                                    <div className="absolute top-2 left-2 flex items-center gap-1 rounded-full bg-red-500/90 px-2 py-0.5 text-[10px] font-bold uppercase tracking-widest text-white">
                                        <span className="h-1.5 w-1.5 rounded-full bg-white animate-pulse" /> Live
                                    </div>
                                    <div className="absolute top-2 right-2 flex items-center gap-1 rounded-full bg-black/60 px-2 py-0.5 text-[11px] text-white">
                                        <Eye size={10} /> {l.viewer_count || 0}
                                    </div>
                                    {l.is_ppv && l.ppv_coins > 0 && (
                                        <div className="absolute bottom-2 right-2 flex items-center gap-1 rounded-full border border-magenta/40 bg-magenta/20 px-2 py-0.5 text-[11px] text-magenta-100">
                                            <Coins size={10} /> {l.ppv_coins}
                                        </div>
                                    )}
                                </div>
                                <div className="p-4">
                                    <div className="font-semibold truncate">{l.title}</div>
                                    <div className="mt-1 flex items-center gap-2 text-xs text-white/50">
                                        <Users size={11} />
                                        <span className="truncate">{l.creator_name} · @{l.creator_handle}</span>
                                    </div>
                                </div>
                            </Link>
                        ))}
                    </div>
                )}
            </section>

            {/* External cams */}
            <section className="mt-12">
                <div className="flex flex-wrap items-center justify-between gap-3">
                    <div className="flex items-center gap-2">
                        <Radio size={14} className="text-red-400 animate-pulse" />
                        <div className="overline flex items-center gap-2">
                            {t("live.cams.title")} · {visibleCams.length > 0 ? t("live.cams.models", { count: visibleCams.length }) : "…"}
                            {refreshing && <RefreshCw size={10} className="animate-spin text-white/30" />}
                            <LiveDot lastRefresh={lastRefresh} />
                        </div>
                    </div>
                    <div className="flex flex-wrap items-center gap-2">
                        {user && (
                            <button
                                onClick={() => setShowFavorites(v => !v)}
                                data-testid="cams-favorites-toggle"
                                className={`inline-flex items-center gap-1.5 rounded-full border px-3 py-1 text-xs font-semibold transition-all ${
                                    showFavorites ? "border-magenta bg-magenta/20 text-white" : "border-white/10 bg-white/[0.03] text-white/60 hover:text-white"
                                }`}>
                                <Heart size={12} className={showFavorites ? "fill-current" : ""} /> {t("live.cams.favorites")} {favorites.length > 0 && `· ${favorites.length}`}
                            </button>
                        )}
                    </div>
                </div>

                {!showFavorites && (
                    <div className="mt-4 flex flex-wrap items-center gap-3">
                        <div className="flex gap-1 rounded-full border border-white/10 bg-white/[0.03] p-1">
                            {GENDER_TABS.map(t => (
                                <button key={t.id}
                                    onClick={() => setGender(t.id)}
                                    data-testid={`cams-tab-${t.id}`}
                                    className={`rounded-full px-3 py-1 text-xs font-semibold transition-all ${
                                        gender === t.id ? "bg-magenta text-white" : "text-white/60 hover:text-white"
                                    }`}>
                                    {t.label}
                                </button>
                            ))}
                        </div>
                        <div className="flex gap-1 rounded-full border border-white/10 bg-white/[0.03] p-1">
                            {SORT_OPTIONS.map(o => {
                                const Icon = o.icon;
                                return (
                                    <button key={o.id}
                                        onClick={() => setSort(o.id)}
                                        data-testid={`cams-sort-${o.id}`}
                                        className={`inline-flex items-center gap-1.5 rounded-full px-3 py-1 text-xs font-semibold transition-all ${
                                            sort === o.id ? "bg-white/10 text-white" : "text-white/50 hover:text-white/80"
                                        }`}>
                                        <Icon size={11} /> {o.label}
                                    </button>
                                );
                            })}
                        </div>
                    </div>
                )}

                {loadingCams && visibleCams.length === 0 ? (
                    <div className="mt-6 grid gap-4 sm:grid-cols-2 lg:grid-cols-3 xl:grid-cols-4">
                        {Array.from({ length: 8 }).map((_, i) => (
                            <div key={i} className="aspect-video animate-pulse rounded-2xl bg-white/5" />
                        ))}
                    </div>
                ) : visibleCams.length === 0 ? (
                    <div className="mt-6 surface-card p-8 text-center text-sm text-white/50" data-testid="cams-empty">
                        {showFavorites ? t("live.cams.empty_favorites") : t("live.cams.empty")}
                    </div>
                ) : (
                    <div className="mt-6 grid gap-4 sm:grid-cols-2 lg:grid-cols-3 xl:grid-cols-4">
                        {visibleCams.map(c => (
                            <CamCard key={c.username} cam={c} onToggleFav={toggleFav} t={t} />
                        ))}
                    </div>
                )}
            </section>
        </div>
    );
}

function LiveDot({ lastRefresh }) {
    const { t } = useTranslation();
    const [age, setAge] = useState(0);
    useEffect(() => {
        const tick = setInterval(() => setAge(Math.floor((Date.now() - (lastRefresh || Date.now())) / 1000)), 1000);
        return () => clearInterval(tick);
    }, [lastRefresh]);
    if (!lastRefresh) return null;
    return (
        <span className="inline-flex items-center gap-1 text-[10px] text-white/40">
            <span className="h-1.5 w-1.5 rounded-full bg-green-400 animate-pulse" />
            {t("live.cams.refreshed", { seconds: age })}
        </span>
    );
}

function CamCard({ cam, onToggleFav, t }) {
    const isOffline = cam.status === "offline";
    return (
        <Link
            to={isOffline ? "#" : `/live/cam/${cam.username}`}
            onClick={e => { if (isOffline) e.preventDefault(); }}
            data-testid={`cam-card-${cam.username}`}
            className={`group relative overflow-hidden rounded-2xl border border-white/5 bg-surface transition-all hover:border-magenta/40 ${isOffline ? "opacity-60" : ""}`}
        >
            <div className="relative aspect-video bg-black">
                {cam.thumb ? (
                    <img src={cam.thumb} alt={cam.username} loading="lazy"
                        className="h-full w-full object-cover transition-transform duration-700 group-hover:scale-105" />
                ) : (
                    <div className="flex h-full w-full items-center justify-center bg-gradient-to-br from-magenta/10 to-obsidian">
                        <Radio size={28} className="text-white/30" />
                    </div>
                )}
                <div className="absolute inset-0 bg-gradient-to-t from-black/80 via-transparent to-transparent" />
                {!isOffline && (
                    <div className="absolute top-2 left-2 flex items-center gap-1 rounded-full bg-red-500/90 px-2 py-0.5 text-[10px] font-bold uppercase tracking-widest text-white">
                        <span className="h-1.5 w-1.5 rounded-full bg-white animate-pulse" /> {t("badge.live")}
                    </div>
                )}
                {isOffline && (
                    <div className="absolute top-2 left-2 rounded-full bg-black/70 px-2 py-0.5 text-[10px] font-bold uppercase tracking-widest text-white/60">
                        {t("live.cams.offline")}
                    </div>
                )}
                <div className="absolute top-2 right-2 flex items-center gap-1">
                    <button
                        type="button"
                        onClick={e => onToggleFav(e, cam.username, cam.is_favorite)}
                        data-testid={`cam-fav-${cam.username}`}
                        className={`rounded-full border p-1.5 backdrop-blur transition-all ${
                            cam.is_favorite ? "border-magenta/60 bg-magenta/70 text-white" : "border-white/20 bg-black/50 text-white/80 hover:bg-black/70"
                        }`}
                        aria-label={cam.is_favorite ? t("cam.favorited") : t("cam.favorite")}
                    >
                        <Heart size={12} className={cam.is_favorite ? "fill-current" : ""} />
                    </button>
                </div>
                {!isOffline && (
                    <div className="absolute bottom-2 left-2 flex items-center gap-1 rounded-full bg-black/70 px-2 py-0.5 text-[11px] text-white">
                        <Eye size={10} /> {formatViewers(cam.viewers)}
                    </div>
                )}
                {cam.is_hd && !isOffline && (
                    <div className="absolute bottom-2 right-2 rounded-full border border-white/30 bg-black/60 px-1.5 py-0.5 text-[9px] font-bold text-white/90">
                        {t("badge.hd")}
                    </div>
                )}
            </div>
            <div className="p-3">
                <div className="flex items-center gap-2">
                    {cam.avatar && <img src={cam.avatar} alt="" className="h-6 w-6 rounded-full object-cover border border-white/10" />}
                    <div className="flex-1 min-w-0">
                        <div className="truncate text-sm font-semibold">{cam.username}</div>
                        <div className="text-[11px] text-white/40 uppercase">{cam.country || "—"}{cam.gender && ` · ${cam.gender}`}</div>
                    </div>
                </div>
            </div>
        </Link>
    );
}

function formatViewers(n) {
    if (!n) return "0";
    if (n >= 10000) return (n / 1000).toFixed(0) + "k";
    if (n >= 1000) return (n / 1000).toFixed(1) + "k";
    return String(n);
}
