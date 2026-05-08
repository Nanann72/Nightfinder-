import { Crown, Flame, Heart, Gem, Users } from "lucide-react";

/**
 * Tiny inline badge rendered next to a fan's name in the live chat.
 * Kinds (left → right priority):
 *   - host        : the creator hosting
 *   - top_tipper  : biggest cumulative tipper of THIS live
 *   - subscriber  : has an active subscription to the creator
 *   - vip         : lifetime spent ≥ 1000 coins
 *   - referrer    : has at least one funded referral
 */
const STYLES = {
    host: {
        Icon: Crown,
        label: "Host",
        cls: "border-amber-400/40 bg-amber-400/15 text-amber-200",
    },
    top_tipper: {
        Icon: Flame,
        label: "Top tipper",
        cls: "border-magenta/40 bg-magenta/15 text-magenta-200",
    },
    subscriber: {
        Icon: Heart,
        label: "Abonné",
        cls: "border-pink-500/40 bg-pink-500/15 text-pink-200",
    },
    vip: {
        Icon: Gem,
        label: "VIP",
        cls: "border-violet-500/40 bg-violet-500/15 text-violet-200",
    },
    referrer: {
        Icon: Users,
        label: "Parrain",
        cls: "border-emerald-500/40 bg-emerald-500/15 text-emerald-200",
    },
};

export default function FanBadge({ kind }) {
    const cfg = STYLES[kind];
    if (!cfg) return null;
    const { Icon, label, cls } = cfg;
    return (
        <span
            className={`inline-flex items-center gap-0.5 rounded-full border px-1.5 py-0.5 text-[9px] font-bold uppercase tracking-wider ${cls}`}
            title={label}
            data-testid={`fan-badge-${kind}`}
        >
            <Icon size={9} strokeWidth={2.5} />
            <span className="hidden sm:inline">{label}</span>
        </span>
    );
}
