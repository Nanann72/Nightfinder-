import { useEffect } from "react";
import { useParams, useNavigate, useSearchParams } from "react-router-dom";
import { Loader2 } from "lucide-react";
import { api } from "@/lib/api";

/**
 * Short shareable creator link: /c/<handle>
 * Resolves the handle (or accepts a creator_id) and forwards to the full
 * profile URL, preserving any utm/subscribe query params.
 */
export default function CreatorShortLink() {
    const { handle } = useParams();
    const [params] = useSearchParams();
    const nav = useNavigate();

    useEffect(() => {
        let cancelled = false;
        (async () => {
            try {
                const clean = (handle || "").replace(/^@/, "").toLowerCase();
                const { data } = await api.get(`/creators/${encodeURIComponent(clean)}`);
                if (cancelled) return;
                const qs = params.toString();
                nav(`/createur/${data.creator_id}${qs ? `?${qs}` : ""}`, { replace: true });
            } catch {
                if (!cancelled) nav("/createurs", { replace: true });
            }
        })();
        return () => { cancelled = true; };
    }, [handle, params, nav]);

    return (
        <div className="container-mx py-24 text-center" data-testid="creator-shortlink-loading">
            <Loader2 className="mx-auto animate-spin text-magenta" size={28} />
            <p className="mt-3 text-sm text-white/55">Redirection…</p>
        </div>
    );
}
