import { Link } from "react-router-dom";
import { useTranslation } from "react-i18next";
import { Flame, Zap, Heart } from "lucide-react";
import { avatarUrl, onAvatarError } from "@/lib/avatars";

/**
 * Fanvue-inspired creator card.
 *  - 3/4 portrait image with smooth 700 ms scale-on-hover
 *  - Frosted price chip + subtle online dot
 *  - Title with refined typography, magenta verified mark
 *  - Hover lifts the card 4 px and adds magenta glow
 */
export default function CreatorCard({ creator, testIdSuffix = "" }) {
    const { t } = useTranslation();
    const isOnline = !!creator.is_online;
    return (
        <Link
            to={`/createur/${creator.creator_id}`}
            data-testid={`creator-card${testIdSuffix}`}
            className="group relative block overflow-hidden rounded-3xl border border-white/10 bg-[var(--bg-surface)] transition-all duration-500 hover:-translate-y-1 hover:border-magenta/30 hover:shadow-[0_18px_40px_-15px_rgba(217,70,239,0.5)]"
        >
            <div className="relative aspect-[3/4] overflow-hidden">
                <img
                    src={avatarUrl(creator)}
                    alt={creator.display_name || creator.handle || "?"}
                    onError={onAvatarError}
                    className="h-full w-full object-cover transition-transform duration-700 ease-out group-hover:scale-110"
                    loading="lazy"
                />
                <div className="pointer-events-none absolute inset-0 bg-gradient-to-t from-black/90 via-black/30 to-transparent" />
            </div>

            {/* Top-left badges */}
            <div className="absolute left-3 top-3 flex gap-1.5">
                {creator.is_featured && (
                    <span className="inline-flex items-center gap-1 rounded-full border border-amber-400/50 bg-amber-500/20 px-2.5 py-1 text-[10px] font-bold uppercase tracking-[0.15em] text-amber-200 backdrop-blur-md" data-testid="featured-badge">
                        <Zap size={10} /> {t("card.featured")}
                    </span>
                )}
                {isOnline && (
                    <span className="pill-online">
                        <span className="h-1.5 w-1.5 rounded-full bg-emerald-400 animate-pulse" />
                        En ligne
                    </span>
                )}
            </div>

            {/* Price chip top-right — Fanvue-style frosted pill */}
            <div className="absolute right-3 top-3 rounded-full border border-white/10 bg-black/60 px-3 py-1.5 font-mono text-xs font-bold text-magenta-200 backdrop-blur-md">
                {creator.active_promo ? (
                    <span>
                        <span className="text-amber-300">-{creator.active_promo.percent_off}%</span>
                        <span className="ml-1 opacity-50 line-through">{creator.subscription_price?.toFixed(2)}€</span>
                        {" · "}{(creator.effective_price ?? creator.subscription_price)?.toFixed(2)}€
                    </span>
                ) : (
                    <>{creator.subscription_price?.toFixed(2)}€<span className="ml-0.5 text-white/40">/mo</span></>
                )}
            </div>

            {/* Card content */}
            <div className="absolute inset-x-0 bottom-0 p-5">
                <div className="flex items-center gap-1.5 text-[10px] font-bold uppercase tracking-[0.2em] text-magenta-400">
                    <Flame size={11} /> {t("card.verified")}
                </div>
                <h3 className="mt-1.5 font-display text-xl font-bold leading-tight tracking-tight">
                    {creator.display_name}
                </h3>
                <p className="mt-0.5 font-mono text-xs text-white/45">@{creator.handle}</p>

                {/* Stats row — subtle, monospace */}
                {(creator.content_count !== undefined || creator.subscribers_count !== undefined) && (
                    <div className="mt-3 flex items-center gap-3 text-[10px] text-white/55">
                        {creator.content_count !== undefined && (
                            <span><span className="font-semibold text-white/85">{creator.content_count}</span> posts</span>
                        )}
                        {creator.subscribers_count !== undefined && (
                            <span className="flex items-center gap-1"><Heart size={9} className="text-red-300" /> {creator.subscribers_count}</span>
                        )}
                    </div>
                )}
            </div>
        </Link>
    );
}
