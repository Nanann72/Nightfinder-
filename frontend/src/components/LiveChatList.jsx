import { useEffect, useRef, useState } from "react";
import { Coins, ChevronDown } from "lucide-react";
import FanBadge from "@/components/FanBadge";

/**
 * Time-relative formatter: "instant" / "il y a Ns" / "il y a Nm" / "il y a Nh".
 * Cheap pure function, called in render — no setInterval per row.
 */
function relTime(iso, now) {
    if (!iso) return "";
    const t = new Date(iso).getTime();
    if (Number.isNaN(t)) return "";
    const diff = Math.max(0, Math.floor((now - t) / 1000));
    if (diff < 5) return "à l'instant";
    if (diff < 60) return `${diff}s`;
    if (diff < 3600) return `${Math.floor(diff / 60)}m`;
    return `${Math.floor(diff / 3600)}h`;
}

/**
 * Live chat list — premium edition.
 *  - Auto-sticks to the bottom while user is at the bottom.
 *  - Shows a "↓ N nouveaux messages" pill when user has scrolled up.
 *  - Tips are highlighted with a bouncy entrance + glow.
 *  - Goal-reached system messages get a celebratory band.
 *  - Relative timestamps refresh every 15 s (single timer for the whole list).
 */
export default function LiveChatList({ messages = [] }) {
    const wrapRef = useRef(null);
    const [now, setNow] = useState(() => Date.now());
    const [stuck, setStuck] = useState(true);
    const [unread, setUnread] = useState(0);
    const lastLen = useRef(messages.length);

    // Single tick to refresh every relative timestamp at once.
    useEffect(() => {
        const iv = setInterval(() => setNow(Date.now()), 15000);
        return () => clearInterval(iv);
    }, []);

    // Track whether user is glued to the bottom of the list.
    useEffect(() => {
        const el = wrapRef.current;
        if (!el) return;
        const onScroll = () => {
            const distance = el.scrollHeight - el.scrollTop - el.clientHeight;
            const atBottom = distance < 24;
            setStuck(atBottom);
            if (atBottom) setUnread(0);
        };
        el.addEventListener("scroll", onScroll, { passive: true });
        return () => el.removeEventListener("scroll", onScroll);
    }, []);

    // Scroll to bottom when new messages arrive AND user was already at bottom.
    useEffect(() => {
        const el = wrapRef.current;
        if (!el) return;
        const grew = messages.length > lastLen.current;
        if (grew) {
            if (stuck) {
                el.scrollTop = el.scrollHeight;
            } else {
                setUnread((u) => u + (messages.length - lastLen.current));
            }
        }
        lastLen.current = messages.length;
    }, [messages.length, stuck]);

    const jumpToBottom = () => {
        const el = wrapRef.current;
        if (!el) return;
        el.scrollTop = el.scrollHeight;
        setUnread(0);
        setStuck(true);
    };

    return (
        <div className="relative flex-1 overflow-hidden">
            <div
                ref={wrapRef}
                className="flex-1 space-y-2 overflow-auto p-3"
                style={{ maxHeight: "55vh", minHeight: "300px" }}
                data-testid="live-chat-feed"
            >
                {messages.length === 0 && (
                    <div className="p-6 text-center text-sm text-white/40" data-testid="live-chat-empty">
                        Sois le premier à dire bonjour 👋
                    </div>
                )}
                {messages.map((m) => (
                    <ChatMessage key={m.message_id} m={m} now={now} />
                ))}
            </div>

            {/* Floating "new messages" pill when user has scrolled up */}
            {!stuck && unread > 0 && (
                <button
                    type="button"
                    onClick={jumpToBottom}
                    data-testid="live-chat-jump-bottom"
                    className="absolute bottom-2 left-1/2 z-10 -translate-x-1/2 inline-flex items-center gap-1.5 rounded-full border border-magenta/50 bg-magenta/30 px-3 py-1 text-xs font-semibold text-white shadow-[0_0_18px_rgba(217,70,239,0.4)] backdrop-blur-md transition-transform hover:scale-105 animate-fadeUp"
                >
                    <ChevronDown size={12} /> {unread} nouveau{unread > 1 ? "x" : ""}
                </button>
            )}
        </div>
    );
}

function ChatMessage({ m, now }) {
    if (m.is_system || m.is_goal_reached) {
        return (
            <div
                data-testid={`live-chat-msg-${m.message_id}`}
                className="rounded-xl border border-amber-300/40 bg-gradient-to-r from-amber-500/15 via-magenta/10 to-amber-500/15 px-3 py-2 text-center text-sm text-amber-100 animate-fadeUp"
            >
                <div className="text-xs font-bold uppercase tracking-widest text-amber-300">
                    {m.name}
                </div>
                <div className="mt-0.5 text-white/90">{m.body}</div>
            </div>
        );
    }
    const isTip = !!m.is_tip;
    return (
        <div
            data-testid={`live-chat-msg-${m.message_id}`}
            className={`rounded-xl px-3 py-2 text-sm transition-all ${
                isTip
                    ? "border border-amber-300/40 bg-gradient-to-r from-amber-500/20 via-magenta/15 to-magenta/5 shadow-[0_0_18px_rgba(251,191,36,0.18)] animate-bounceTip"
                    : m.is_creator
                        ? "border border-amber-500/30 bg-amber-500/10"
                        : "bg-white/[0.03] hover:bg-white/[0.05]"
            }`}
        >
            <div className="flex flex-wrap items-center gap-1.5">
                {m.avatar_url ? (
                    <img src={m.avatar_url} alt="" className="h-5 w-5 rounded-full object-cover" />
                ) : (
                    <div className="flex h-5 w-5 items-center justify-center rounded-full bg-magenta/30 text-[10px] font-bold">
                        {m.name?.[0]?.toUpperCase() || "•"}
                    </div>
                )}
                <span className={`text-xs font-semibold ${m.is_creator ? "text-amber-300" : "text-white/85"}`}>
                    {m.name}
                </span>
                {(m.badges || []).map((b) => <FanBadge key={b} kind={b} />)}
                {isTip && (
                    <span className="inline-flex items-center gap-0.5 rounded-full bg-gradient-to-r from-amber-400/70 to-magenta/70 px-2 py-0.5 text-[10px] font-bold text-white">
                        <Coins size={9} /> {m.tip_coins}
                    </span>
                )}
                <span className="ml-auto text-[10px] text-white/35" data-testid="chat-timestamp">
                    {relTime(m.created_at, now)}
                </span>
            </div>
            {m.body && <div className="mt-1 break-words text-sm text-white/90">{m.body}</div>}
        </div>
    );
}
