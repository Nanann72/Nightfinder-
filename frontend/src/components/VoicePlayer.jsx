import { useEffect, useRef, useState } from "react";
import { Play, Pause, Mic } from "lucide-react";

function fmt(t) {
    if (!t || !isFinite(t)) return "0:00";
    const m = Math.floor(t / 60);
    const s = Math.floor(t % 60).toString().padStart(2, "0");
    return `${m}:${s}`;
}

/**
 * VoicePlayer — minimal Apple-style audio player for DM voice notes.
 * Shows a play/pause toggle, a progress bar, and the current/total time.
 * `mine`=true uses inverted colors (white pill on magenta bubble).
 */
export default function VoicePlayer({ src, duration = 0, mine = false, testId }) {
    const audioRef = useRef(null);
    const [playing, setPlaying] = useState(false);
    const [current, setCurrent] = useState(0);
    const [total, setTotal] = useState(duration || 0);

    useEffect(() => {
        const a = audioRef.current;
        if (!a) return;
        const onTime = () => setCurrent(a.currentTime);
        const onMeta = () => { if (isFinite(a.duration) && a.duration > 0) setTotal(a.duration); };
        const onEnd = () => { setPlaying(false); setCurrent(0); };
        a.addEventListener("timeupdate", onTime);
        a.addEventListener("loadedmetadata", onMeta);
        a.addEventListener("ended", onEnd);
        return () => {
            a.removeEventListener("timeupdate", onTime);
            a.removeEventListener("loadedmetadata", onMeta);
            a.removeEventListener("ended", onEnd);
        };
    }, []);

    const toggle = async () => {
        const a = audioRef.current;
        if (!a) return;
        if (playing) { a.pause(); setPlaying(false); }
        else {
            try { await a.play(); setPlaying(true); } catch {}
        }
    };

    const pct = total > 0 ? Math.min(100, (current / total) * 100) : 0;

    const seek = (e) => {
        const a = audioRef.current;
        if (!a || !total) return;
        const rect = e.currentTarget.getBoundingClientRect();
        const ratio = (e.clientX - rect.left) / rect.width;
        a.currentTime = Math.max(0, Math.min(total, ratio * total));
    };

    return (
        <div
            data-testid={testId || "voice-player"}
            className={`flex items-center gap-2.5 rounded-full px-2 py-1.5 ${mine ? "bg-white/15" : "bg-black/30 border border-white/10"}`}
            style={{ minWidth: 200 }}
        >
            <button
                type="button"
                onClick={toggle}
                aria-label={playing ? "Pause" : "Lire"}
                className={`flex h-9 w-9 shrink-0 items-center justify-center rounded-full ${mine ? "bg-white text-magenta" : "bg-magenta text-white"}`}
                data-testid={`${testId || "voice-player"}-toggle`}
            >
                {playing ? <Pause size={15} /> : <Play size={15} className="ml-0.5" />}
            </button>
            <div className="flex-1 min-w-0">
                <div
                    onClick={seek}
                    className={`relative h-1.5 w-full cursor-pointer overflow-hidden rounded-full ${mine ? "bg-white/30" : "bg-white/15"}`}
                >
                    <div
                        className={`absolute inset-y-0 left-0 rounded-full ${mine ? "bg-white" : "bg-magenta"}`}
                        style={{ width: `${pct}%` }}
                    />
                </div>
                <div className={`mt-1 flex items-center justify-between text-[10px] font-mono ${mine ? "text-white/80" : "text-white/55"}`}>
                    <span className="inline-flex items-center gap-1"><Mic size={9} /> Vocal</span>
                    <span>{fmt(current)} / {fmt(total)}</span>
                </div>
            </div>
            <audio ref={audioRef} src={src} preload="metadata" className="hidden" />
        </div>
    );
}
