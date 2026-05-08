import { useEffect, useRef } from "react";
import { useNavigate } from "react-router-dom";
import { api, tokenStore } from "@/lib/api";
import { useAuth } from "@/lib/auth";

export default function AuthCallback() {
    const nav = useNavigate();
    const { setUser } = useAuth();
    const done = useRef(false);

    useEffect(() => {
        if (done.current) return;
        done.current = true;
        const hash = window.location.hash || "";
        const m = hash.match(/session_id=([^&]+)/);
        const sessionId = m ? m[1] : null;
        if (!sessionId) {
            nav("/login");
            return;
        }
        (async () => {
            try {
                const { data } = await api.post("/auth/google/callback", { session_id: sessionId });
                if (data.access_token) tokenStore.set(data.access_token);
                if (data.refresh_token) tokenStore.setRefresh(data.refresh_token);
                setUser(data.user);
                nav(data.user.role === "creator" ? "/dashboard" : "/createurs", { replace: true });
            } catch {
                nav("/login?error=google", { replace: true });
            }
        })();
    }, [nav, setUser]);

    return (
        <div className="flex min-h-[60vh] items-center justify-center" data-testid="auth-callback-loader">
            <div className="text-center">
                <div className="mx-auto h-10 w-10 animate-spin rounded-full border-2 border-magenta/20 border-t-magenta" />
                <p className="mt-4 text-sm text-white/60">Authentification en cours…</p>
            </div>
        </div>
    );
}
