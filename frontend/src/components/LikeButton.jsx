import { useState } from "react";
import { Heart } from "lucide-react";
import { api } from "@/lib/api";
import { useAuth } from "@/lib/auth";
import { useNavigate, useLocation } from "react-router-dom";

/**
 * Optimistic like button. Requires `content` prop with `content_id`, `is_liked`, `likes_count`.
 * Shows count next to the heart. Authenticated users only — redirects to /login otherwise.
 */
export default function LikeButton({ content, size = 16, compact = false, className = "" }) {
    const { user } = useAuth();
    const nav = useNavigate();
    const loc = useLocation();
    const [liked, setLiked] = useState(!!content?.is_liked);
    const [count, setCount] = useState(Number(content?.likes_count || 0));
    const [busy, setBusy] = useState(false);

    const toggle = async (e) => {
        e.preventDefault(); e.stopPropagation();
        if (!user) {
            nav(`/login?next=${encodeURIComponent(loc.pathname)}`);
            return;
        }
        if (busy) return;
        setBusy(true);
        const prev = { liked, count };
        const next = liked
            ? { liked: false, count: Math.max(0, count - 1) }
            : { liked: true, count: count + 1 };
        setLiked(next.liked); setCount(next.count);
        try {
            if (prev.liked) {
                await api.delete(`/content/${content.content_id}/like`);
            } else {
                await api.post(`/content/${content.content_id}/like`);
            }
        } catch {
            // Revert on error
            setLiked(prev.liked); setCount(prev.count);
        } finally { setBusy(false); }
    };

    return (
        <button
            type="button"
            onClick={toggle}
            disabled={busy}
            data-testid={`like-btn-${content?.content_id}`}
            className={`inline-flex items-center gap-1 rounded-full border px-2.5 py-1 text-xs font-semibold transition-all ${
                liked
                    ? "border-magenta/50 bg-magenta/20 text-magenta-200"
                    : "border-white/10 bg-black/40 text-white/70 hover:border-magenta/40 hover:text-white"
            } ${compact ? "px-2 py-0.5 text-[11px]" : ""} ${className}`}
            aria-pressed={liked}
            aria-label={liked ? "Retirer mon like" : "Aimer"}
        >
            <Heart size={size} fill={liked ? "currentColor" : "none"} strokeWidth={2} />
            <span data-testid={`like-count-${content?.content_id}`}>{count}</span>
        </button>
    );
}
