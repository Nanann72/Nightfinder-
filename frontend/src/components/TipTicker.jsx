import { useEffect, useRef, useState } from "react";
import { Coins, Sparkles } from "lucide-react";

/**
 * Stripchat-style scrolling tip ticker pinned at the top of the live stage.
 *
 * `tips` = chronological array (latest last) of `{ id, name, coins, message? }`.
 * We keep the LAST 5 entries and show a single one at a time, animating in
 * every 4 seconds, so it stays subtle and readable.
 */
export default function TipTicker({ tips }) {
    const [idx, setIdx] = useState(0);
    const lastLen = useRef(tips.length);

    // Whenever a new tip lands, jump to it immediately for instant feedback.
    useEffect(() => {
        if (tips.length > lastLen.current) {
            setIdx(tips.length - 1);
        }
        lastLen.current = tips.length;
    }, [tips.length]);

    // Auto-rotate every 4 s through the last 5 tips.
    useEffect(() => {
        if (tips.length < 2) return;
        const iv = setInterval(() => {
            setIdx((i) => (i + 1) % Math.min(tips.length, 5));
        }, 4000);
        return () => clearInterval(iv);
    }, [tips.length]);

    if (tips.length === 0) return null;
    const tail = tips.slice(-5);
    const cur = tail[idx % tail.length] || tail[tail.length - 1];

    return (
        <div
            data-testid="live-tip-ticker"
            className="pointer-events-none absolute left-1/2 top-3 z-10 max-w-[80%] -translate-x-1/2 sm:top-4"
        >
            <div
                key={cur.id}
                className="flex items-center gap-2 rounded-full border border-amber-300/40 bg-gradient-to-r from-amber-500/30 via-magenta/30 to-amber-500/30 px-3 py-1.5 text-[11px] font-semibold text-white shadow-[0_0_24px_rgba(251,191,36,0.35)] backdrop-blur-md animate-[fadeUp_350ms_ease-out]"
            >
                <Sparkles size={11} className="text-amber-200" />
                <span className="truncate">
                    <span className="text-amber-200">{cur.name}</span>
                    <span className="mx-1 text-white/70">a envoyé</span>
                </span>
                <span className="inline-flex items-center gap-0.5 rounded-full bg-black/40 px-1.5 font-mono text-amber-100">
                    <Coins size={10} /> {cur.coins}
                </span>
            </div>
        </div>
    );
}
