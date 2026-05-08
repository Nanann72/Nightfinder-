import { Lock, Shield } from "lucide-react";
import { useWatermarkedImage } from "@/lib/watermark";
import LikeButton from "@/components/LikeButton";
import ProtectedImage from "@/components/ProtectedImage";

export default function PaywallContent({ content, onUnlock, isCreatorView = false }) {
    const unlocked = content.is_unlocked || isCreatorView;
    const coinsPrice = content.unlock_price_coins ?? Math.round((content.unlock_price || 0) * 10);
    // Only watermark paid content when unlocked for a fan (not for the creator's own view)
    const shouldWatermark = unlocked && !isCreatorView && (content.unlock_price || 0) > 0;
    const displayUrl = useWatermarkedImage(content.media_url, shouldWatermark);
    const is24h = !!content.expires_at;
    return (
        <div
            data-testid={`content-card-${content.content_id}`}
            className="relative aspect-[4/5] overflow-hidden rounded-2xl border border-white/5 bg-surface"
            onContextMenu={(e) => { e.preventDefault(); return false; }}
        >
            <ProtectedImage
                src={displayUrl || content.media_url}
                alt={content.title}
                className={`absolute inset-0 h-full w-full transition-all duration-500 ${unlocked ? "" : "scale-110 blur-2xl"}`}
                loading="lazy"
            />
            {is24h && (
                <div className="pointer-events-none absolute right-2 top-2 inline-flex items-center gap-1 rounded-full border border-amber-400/40 bg-amber-500/20 px-2 py-0.5 text-[10px] font-bold uppercase tracking-wider text-amber-200 backdrop-blur-sm">
                    24h
                </div>
            )}
            {!unlocked && (
                <div className="absolute inset-0 flex flex-col items-center justify-center gap-3 bg-black/60 backdrop-blur-sm">
                    <div className="flex h-14 w-14 items-center justify-center rounded-full border border-white/10 bg-black/60">
                        <Lock size={20} className="text-magenta-400" />
                    </div>
                    <div className="text-center">
                        <div className="overline mb-1">Contenu exclusif</div>
                        {coinsPrice > 0 ? (
                            <button
                                data-testid={`unlock-btn-${content.content_id}`}
                                onClick={() => onUnlock?.(content)}
                                className="btn-primary mt-2 text-sm"
                            >
                                Déverrouiller · {coinsPrice} coins
                            </button>
                        ) : (
                            <div className="mt-1 text-sm font-semibold text-white">Réservé aux abonnés</div>
                        )}
                    </div>
                </div>
            )}
            {unlocked && (
                <>
                    <div className="pointer-events-none absolute inset-x-0 bottom-0 bg-gradient-to-t from-black/70 to-transparent p-3">
                        <div className="text-sm font-semibold">{content.title}</div>
                    </div>
                    <div className="absolute bottom-2 right-2">
                        <LikeButton content={content} compact />
                    </div>
                    {shouldWatermark && (
                        <div
                            className="pointer-events-none absolute top-2 left-2 inline-flex items-center gap-1 rounded-full border border-white/20 bg-black/60 px-2 py-0.5 text-[10px] text-white/80"
                            data-testid={`wm-badge-${content.content_id}`}
                            title="Image filigranée à ton identifiant pour prévenir les fuites"
                        >
                            <Shield size={10} /> Protégé
                        </div>
                    )}
                </>
            )}
        </div>
    );
}
