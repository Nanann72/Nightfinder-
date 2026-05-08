import { useEffect, useState } from "react";
import { Clock } from "lucide-react";

/**
 * Real-time HH:MM:SS counter since the live started.
 * Refreshes every second locally — no extra API hit.
 */
export default function LiveDurationTimer({ startedAt }) {
    const [now, setNow] = useState(() => Date.now());
    useEffect(() => {
        const iv = setInterval(() => setNow(Date.now()), 1000);
        return () => clearInterval(iv);
    }, []);
    if (!startedAt) return null;
    const start = new Date(startedAt).getTime();
    const elapsed = Math.max(0, Math.floor((now - start) / 1000));
    const h = Math.floor(elapsed / 3600);
    const m = Math.floor((elapsed % 3600) / 60);
    const s = elapsed % 60;
    const pad = (n) => String(n).padStart(2, "0");
    const label = h > 0 ? `${h}:${pad(m)}:${pad(s)}` : `${pad(m)}:${pad(s)}`;
    return (
        <span
            className="inline-flex items-center gap-1.5 rounded-full border border-white/10 bg-black/30 px-2.5 py-0.5 font-mono text-[11px] text-white/80"
            data-testid="live-duration"
        >
            <Clock size={11} className="text-magenta-200" /> {label}
        </span>
    );
}
