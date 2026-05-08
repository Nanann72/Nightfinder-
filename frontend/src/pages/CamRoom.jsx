import { useEffect, useState } from "react";
import { useParams, Link } from "react-router-dom";
import { useTranslation } from "react-i18next";
import { api, BACKEND_URL } from "@/lib/api";
import { useAuth } from "@/lib/auth";
import HlsPlayer from "@/components/HlsPlayer";
import { Radio, Eye, Users, ArrowLeft, Heart, Gift } from "lucide-react";

export default function CamRoom() {
    const { username } = useParams();
    const { user } = useAuth();
    const { t, i18n } = useTranslation();
    const [cam, setCam] = useState(null);
    const [loading, setLoading] = useState(true);
    const [err, setErr] = useState("");

    const load = async () => {
        try {
            const { data } = await api.get(`/cams/${username}`);
            setCam(data);
        } catch (e) {
            setErr(e.response?.data?.detail || "Cam introuvable");
        } finally { setLoading(false); }
    };

    useEffect(() => {
        let cancelled = false;
        const run = async () => { if (!cancelled) await load(); };
        run();
        const t = setInterval(run, 20000); // real-time viewer count refresh
        return () => { cancelled = true; clearInterval(t); };
        // eslint-disable-next-line react-hooks/exhaustive-deps
    }, [username]);

    const toggleFav = async () => {
        if (!user) { window.location.href = `/login?next=${encodeURIComponent(`/live/cam/${username}`)}`; return; }
        const was = cam.is_favorite;
        setCam(c => ({ ...c, is_favorite: !was }));
        try {
            if (was) await api.delete(`/cams/favorites/${encodeURIComponent(username)}`);
            else await api.post(`/cams/favorites/${encodeURIComponent(username)}`);
        } catch {
            setCam(c => ({ ...c, is_favorite: was }));
        }
    };

    if (loading) return <div className="container-mx py-24 text-center text-white/40" data-testid="cam-loading">{t("action.loading")}</div>;
    if (err || !cam) {
        return (
            <div className="container-mx py-24 text-center" data-testid="cam-error">
                <div className="font-display text-xl font-bold">{t("cam.offline_title")}</div>
                <p className="mt-2 text-sm text-white/60">{err || t("cam.offline_body")}</p>
                <Link to="/live" className="btn-ghost mt-6 inline-flex">
                    <ArrowLeft size={14} /> {t("cam.back")}
                </Link>
            </div>
        );
    }

    return (
        <div className="relative z-10 container-mx py-6">
            <Link to="/live" data-testid="cam-back" className="inline-flex items-center gap-1.5 text-xs text-white/60 hover:text-white">
                <ArrowLeft size={12} /> {t("cam.back")}
            </Link>

            <div className="mt-4 grid gap-4 lg:grid-cols-12">
                {/* Player */}
                <div className="lg:col-span-8">
                    <div className="surface-card !p-0 overflow-hidden">
                        <div className="flex items-center justify-between gap-3 border-b border-white/5 p-4">
                            <div className="flex items-center gap-3 min-w-0">
                                {cam.avatar && (
                                    <img src={cam.avatar} alt="" className="h-10 w-10 rounded-full border border-magenta/40 object-cover" />
                                )}
                                <div className="min-w-0">
                                    <div className="font-semibold truncate flex items-center gap-2">
                                        {cam.username}
                                        <span className="inline-flex items-center gap-1 rounded-full bg-red-500/20 px-2 py-0.5 text-[10px] font-bold uppercase tracking-widest text-red-300">
                                            <span className="h-1.5 w-1.5 rounded-full bg-red-400 animate-pulse" /> {t("badge.live")}
                                        </span>
                                        {cam.is_hd && (
                                            <span className="rounded-full border border-white/15 bg-white/[0.04] px-2 py-0.5 text-[10px] font-bold text-white/70">{t("badge.hd")}</span>
                                        )}
                                    </div>
                                    <div className="text-xs text-white/50 uppercase">{cam.country} · {cam.gender}</div>
                                </div>
                            </div>
                            <div className="flex items-center gap-3 text-xs text-white/60">
                                <span className="flex items-center gap-1" data-testid="cam-viewers"><Eye size={12} /> {cam.viewers?.toLocaleString(i18n.language || "fr")}</span>
                            </div>
                        </div>

                        <HlsPlayer src={cam.hls?.startsWith("/") ? `${BACKEND_URL}${cam.hls}` : cam.hls} poster={cam.preview_thumb || cam.thumb} className="aspect-video" />
                    </div>
                </div>

                {/* Info side panel */}
                <div className="lg:col-span-4">
                    <div className="surface-card space-y-4">
                        <div>
                            <div className="overline flex items-center gap-2">
                                <Radio size={12} className="text-red-400 animate-pulse" /> {t("live.eyebrow")}
                            </div>
                            <div className="mt-2 font-display text-2xl font-bold">{cam.username}</div>
                            <div className="mt-1 text-sm text-white/60 flex items-center gap-2">
                                <Users size={12} /> {t("cam.viewers", { count: cam.viewers?.toLocaleString(i18n.language || "fr") })}
                            </div>
                        </div>

                        {cam.languages?.length > 0 && (
                            <div>
                                <div className="text-xs text-white/50">{t("cam.languages")}</div>
                                <div className="mt-1 flex flex-wrap gap-1.5">
                                    {cam.languages.map(l => (
                                        <span key={l} className="rounded-full border border-white/10 bg-white/[0.03] px-2 py-0.5 text-[11px] text-white/70 uppercase">
                                            {l}
                                        </span>
                                    ))}
                                </div>
                            </div>
                        )}

                        <div className="rounded-xl border border-white/10 bg-white/[0.02] p-3 text-xs text-white/50">
                            {t("cam.respectful")}
                        </div>

                        <div className="flex gap-2">
                            <button
                                onClick={toggleFav}
                                className={`inline-flex flex-1 items-center justify-center gap-1.5 rounded-full border px-3 py-2 text-xs font-semibold transition-all ${
                                    cam.is_favorite
                                        ? "border-magenta bg-magenta/20 text-white"
                                        : "border-white/10 bg-white/[0.03] text-white/70 hover:text-white hover:border-white/20"
                                }`}
                                data-testid="cam-favorite"
                            >
                                <Heart size={14} className={cam.is_favorite ? "fill-current" : ""} />
                                {cam.is_favorite ? t("cam.favorited") : t("cam.favorite")}
                            </button>
                            <Link to="/createurs" className="btn-outline-magenta flex-1 justify-center text-xs">
                                <Gift size={14} /> {t("cam.my_creators")}
                            </Link>
                        </div>
                    </div>
                </div>
            </div>
        </div>
    );
}
