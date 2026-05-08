import { Target, Trophy, Flame } from "lucide-react";

/**
 * Animated tip-goal progress bar with milestones and shimmer flow.
 *  - 4 milestones at 25/50/75/100% → small dots highlight as they're crossed
 *  - Shimmer overlay travelling from left to right when the goal is "alive"
 *  - Trophy + glow when the goal is reached
 */
export default function TipGoalBar({
    goalCoins,
    totalTips = 0,
    description = "",
    celebrate = false,
}) {
    if (!goalCoins || goalCoins <= 0) return null;
    const pct = Math.min(100, Math.round((totalTips / goalCoins) * 100));
    const reached = totalTips >= goalCoins;

    return (
        <div
            data-testid="live-goal-overlay"
            className="pointer-events-none absolute inset-x-0 bottom-0 z-10 p-3 sm:p-4"
        >
            <div
                className={`rounded-xl border bg-black/60 p-3 backdrop-blur-md transition-all ${
                    celebrate
                        ? "scale-[1.03] border-amber-300 bg-amber-500/30 shadow-[0_0_60px_rgba(251,191,36,0.6)]"
                        : reached
                            ? "border-amber-300/70 bg-amber-500/15 shadow-[0_0_28px_rgba(251,191,36,0.35)]"
                            : "border-magenta/40"
                }`}
            >
                <div className="flex items-center justify-between gap-2 text-xs">
                    <span className="inline-flex items-center gap-1.5 font-semibold text-white">
                        {reached ? (
                            <Trophy size={12} className="text-amber-300 animate-pulse" />
                        ) : (
                            <Target size={12} className="text-magenta-200" />
                        )}
                        {celebrate
                            ? "🎉 Objectif atteint !"
                            : description || "Objectif"}
                    </span>
                    <span className="font-mono text-magenta-200" data-testid="live-goal-amount">
                        {Math.min(totalTips, goalCoins)} / {goalCoins}
                    </span>
                </div>
                <div className="relative mt-1.5 h-2.5 overflow-hidden rounded-full bg-white/10">
                    <div
                        className={`h-full rounded-full transition-all duration-700 ease-out ${
                            celebrate
                                ? "bg-gradient-to-r from-amber-300 via-magenta to-amber-300 bg-[length:200%_100%] animate-[gradientFlow_2s_linear_infinite]"
                                : "bg-gradient-to-r from-magenta to-magenta-200"
                        }`}
                        style={{ width: `${pct}%` }}
                    />
                    {/* Shimmer overlay */}
                    {!reached && pct > 0 && (
                        <div
                            className="absolute inset-y-0 -left-1/3 w-1/3 -skew-x-12 bg-gradient-to-r from-transparent via-white/30 to-transparent animate-[shimmerSlide_2.4s_ease-in-out_infinite]"
                            style={{ width: `${Math.max(20, pct / 3)}%` }}
                        />
                    )}
                    {/* Milestone dots */}
                    {[25, 50, 75].map((m) => (
                        <span
                            key={m}
                            className={`absolute top-1/2 h-1.5 w-1.5 -translate-x-1/2 -translate-y-1/2 rounded-full transition-colors ${
                                pct >= m ? "bg-white" : "bg-white/30"
                            }`}
                            style={{ left: `${m}%` }}
                        />
                    ))}
                </div>
                {/* Hot-streak hint */}
                {!reached && pct >= 75 && (
                    <div className="mt-1 inline-flex items-center gap-1 text-[10px] font-semibold text-amber-200/90">
                        <Flame size={10} /> Plus que {goalCoins - totalTips} coins !
                    </div>
                )}
            </div>
        </div>
    );
}
