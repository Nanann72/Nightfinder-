import { Link } from "react-router-dom";
import { Eye, Coins, Heart, Trophy, Clock, Sparkles, Home } from "lucide-react";

/**
 * Premium "live ended" recap card. Shown after a session moves to status="ended".
 *  - Gradient header with creator avatar
 *  - Stats grid: peak viewers, coins earned, favorites, duration
 *  - Top-3 tippers podium (gold / silver / bronze)
 *  - CTA: back to live lobby + visit creator profile
 */
export default function LiveEndedRecap({ session, topTippers = [] }) {
    const dur = (() => {
        if (!session?.started_at || !session?.ended_at) return null;
        const ms = new Date(session.ended_at) - new Date(session.started_at);
        const s = Math.max(0, Math.floor(ms / 1000));
        const h = Math.floor(s / 3600);
        const m = Math.floor((s % 3600) / 60);
        const sec = s % 60;
        return h > 0 ? `${h}h ${m}m` : `${m}m ${String(sec).padStart(2, "0")}s`;
    })();

    const peakViewers = session?.peak_viewer_count || session?.viewer_count || 0;
    const coinsTipped = session?.total_tips || 0;
    const favorites = session?.favorites_count || 0;
    const podiumColors = [
        "from-amber-300/30 to-amber-300/5 border-amber-300/60 text-amber-200",
        "from-white/15 to-white/5 border-white/30 text-white/90",
        "from-orange-400/20 to-orange-400/5 border-orange-400/50 text-orange-200",
    ];

    return (
        <div
            className="relative overflow-hidden rounded-2xl border border-magenta/30 bg-gradient-to-br from-magenta/15 via-obsidian to-obsidian p-6 sm:p-8 animate-fadeUp"
            data-testid="live-ended-recap"
        >
            <div className="absolute -top-24 -right-24 h-64 w-64 rounded-full bg-magenta/30 blur-3xl" />
            <div className="absolute -bottom-32 -left-20 h-72 w-72 rounded-full bg-amber-400/15 blur-3xl" />

            <div className="relative">
                <div className="flex items-center gap-4">
                    {session?.creator_avatar ? (
                        <img
                            src={session.creator_avatar}
                            alt=""
                            className="h-16 w-16 rounded-2xl border-2 border-magenta/50 object-cover"
                        />
                    ) : (
                        <div className="flex h-16 w-16 items-center justify-center rounded-2xl border-2 border-magenta/50 bg-magenta/20 text-2xl font-bold text-white">
                            {session?.creator_name?.[0]?.toUpperCase() || "•"}
                        </div>
                    )}
                    <div className="min-w-0">
                        <div className="overline mb-1 flex items-center gap-1.5">
                            <Sparkles size={11} className="text-magenta-200" /> Live terminé
                        </div>
                        <h2 className="font-display text-2xl font-bold truncate" data-testid="recap-title">
                            {session?.title || "Live terminé"}
                        </h2>
                        <Link
                            to={`/createur/${session?.creator_id}`}
                            className="text-xs text-white/60 hover:text-magenta-200 transition-colors"
                        >
                            {session?.creator_name} · @{session?.creator_handle}
                        </Link>
                    </div>
                </div>

                {/* Stats grid */}
                <div className="mt-6 grid grid-cols-2 gap-2 sm:grid-cols-4">
                    <Stat icon={Clock} label="Durée" value={dur || "—"} testId="recap-duration" />
                    <Stat icon={Eye} label="Viewers max" value={peakViewers} testId="recap-viewers" />
                    <Stat icon={Coins} label="Coins reçus" value={coinsTipped} testId="recap-coins" />
                    <Stat icon={Heart} label="Favoris" value={favorites} testId="recap-favorites" />
                </div>

                {/* Top tippers podium */}
                {topTippers.length > 0 && (
                    <div className="mt-6">
                        <div className="overline mb-3 flex items-center gap-1.5">
                            <Trophy size={11} className="text-amber-300" /> Podium des pourboires
                        </div>
                        <div className="grid gap-2 sm:grid-cols-3">
                            {topTippers.slice(0, 3).map((t, i) => (
                                <div
                                    key={t.user_id || i}
                                    data-testid={`recap-tipper-${i + 1}`}
                                    className={`flex items-center gap-3 rounded-xl border bg-gradient-to-br p-3 backdrop-blur ${podiumColors[i]}`}
                                >
                                    <div className="text-2xl font-bold leading-none">
                                        {["🥇", "🥈", "🥉"][i]}
                                    </div>
                                    <div className="min-w-0 flex-1">
                                        <div className="truncate text-sm font-semibold">
                                            {t.name || "Anonyme"}
                                        </div>
                                        <div className="font-mono text-xs">
                                            <Coins size={10} className="inline" /> {t.coins}
                                        </div>
                                    </div>
                                </div>
                            ))}
                        </div>
                    </div>
                )}

                {/* CTAs */}
                <div className="mt-6 flex flex-wrap gap-2">
                    <Link to="/live" className="btn-primary" data-testid="recap-cta-live">
                        <Home size={14} /> Retour au lobby
                    </Link>
                    {session?.creator_id && (
                        <Link
                            to={`/createur/${session.creator_id}`}
                            className="btn-ghost"
                            data-testid="recap-cta-creator"
                        >
                            Voir le profil de {session.creator_name?.split(" ")[0]}
                        </Link>
                    )}
                </div>
            </div>
        </div>
    );
}

function Stat({ icon: Icon, label, value, testId }) {
    return (
        <div
            className="rounded-xl border border-white/10 bg-white/[0.04] p-3 transition-all hover:border-white/20 hover:bg-white/[0.07]"
            data-testid={testId}
        >
            <div className="flex items-center gap-1.5 text-[10px] font-bold uppercase tracking-widest text-white/50">
                <Icon size={11} className="text-magenta-200" /> {label}
            </div>
            <div className="mt-1 font-mono text-2xl font-bold text-white">{value}</div>
        </div>
    );
}
