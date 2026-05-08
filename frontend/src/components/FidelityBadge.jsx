import { Crown, Star, Award, Medal } from "lucide-react";

const ICONS = {
    vip: Crown,
    gold: Award,
    silver: Medal,
    bronze: Star,
};

const TIERS_ORDER = ["bronze", "silver", "gold", "vip"];

export default function FidelityBadge({ badge, size = "sm", showProgress = false, lifetimeSpent }) {
    if (!badge) return null;
    const Icon = ICONS[badge.tier] || Star;
    const padding = size === "lg" ? "px-3 py-1.5 text-sm" : size === "md" ? "px-2.5 py-1 text-xs" : "px-2 py-0.5 text-[10px]";
    const iconSize = size === "lg" ? 14 : size === "md" ? 12 : 10;

    const progress = showProgress && badge.next_min && lifetimeSpent != null
        ? Math.min(100, Math.round(((lifetimeSpent - badge.min) / (badge.next_min - badge.min)) * 100))
        : null;

    return (
        <div className="inline-flex flex-col gap-1" data-testid={`badge-${badge.tier}`}>
            <span
                className={`inline-flex items-center gap-1 rounded-full border font-semibold uppercase tracking-wide ${padding}`}
                style={{
                    color: badge.color,
                    borderColor: `${badge.color}55`,
                    backgroundColor: `${badge.color}15`,
                }}
            >
                <Icon size={iconSize} /> {badge.label}
            </span>
            {showProgress && badge.next_label && progress != null && (
                <div className="w-full">
                    <div className="h-1.5 w-full overflow-hidden rounded-full bg-white/5">
                        <div className="h-full transition-all" style={{ width: `${progress}%`, backgroundColor: badge.color }} />
                    </div>
                    <div className="mt-1 text-[10px] text-white/40">
                        {badge.next_min - (lifetimeSpent || 0)} coins pour passer {badge.next_label}
                    </div>
                </div>
            )}
        </div>
    );
}

export { TIERS_ORDER };
