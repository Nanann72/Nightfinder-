import { useEffect, useRef } from "react";
import { useNavigate } from "react-router-dom";
import { api, tokenStore } from "@/lib/api";
import { useAuth } from "@/lib/auth";

/**
 * Handles the redirect back from Google's direct OAuth authorization-code flow.
 * Reads ?code=...&state=... from the URL, verifies state (CSRF), POSTs to
 * /api/auth/google/direct with {code, redirect_uri}, and logs the user in.
 *
 * REMINDER: DO NOT HARDCODE THE URL, OR ADD ANY FALLBACKS OR REDIRECT URLS, THIS BREAKS THE AUTH
 */
export default function GoogleDirectCallback() {
    const nav = useNavigate();
    const { setUser } = useAuth();
    const done = useRef(false);

    useEffect(() => {
        if (done.current) return;
        done.current = true;
        const sp = new URLSearchParams(window.location.search);
        const code = sp.get("code");
        const state = sp.get("state");
        const savedState = sessionStorage.getItem("g_oauth_state");
        sessionStorage.removeItem("g_oauth_state");
        if (!code || !state || state !== savedState) {
            nav("/login?error=google_state", { replace: true });
            return;
        }
        (async () => {
            try {
                const redirectUri = window.location.origin + "/auth/google";
                const { data } = await api.post("/auth/google/direct", { code, redirect_uri: redirectUri });
                if (data.access_token) tokenStore.set(data.access_token);
                if (data.refresh_token) tokenStore.setRefresh(data.refresh_token);
                setUser(data.user);
                nav(data.user.role === "creator" ? "/dashboard" : "/createurs", { replace: true });
            } catch (e) {
                nav(`/login?error=google_${e.response?.status || "fail"}`, { replace: true });
            }
        })();
    }, [nav, setUser]);

    return (
        <div className="flex min-h-[60vh] items-center justify-center" data-testid="google-direct-callback">
            <div className="text-center">
                <div className="mx-auto h-10 w-10 animate-spin rounded-full border-2 border-magenta/20 border-t-magenta" />
                <p className="mt-4 text-sm text-white/60">Connexion à Google en cours…</p>
            </div>
        </div>
    );
}
