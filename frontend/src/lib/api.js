import axios from "axios";

export const BACKEND_URL = process.env.REACT_APP_BACKEND_URL;
export const API = `${BACKEND_URL}/api`;

const TOKEN_KEY = "meandyou_access_token";
const REFRESH_KEY = "meandyou_refresh_token";

export const tokenStore = {
    get: () => {
        try { return localStorage.getItem(TOKEN_KEY); } catch { return null; }
    },
    set: (token) => {
        try {
            if (token) localStorage.setItem(TOKEN_KEY, token);
            else localStorage.removeItem(TOKEN_KEY);
        } catch { /* storage disabled */ }
    },
    clear: () => {
        try {
            localStorage.removeItem(TOKEN_KEY);
            localStorage.removeItem(REFRESH_KEY);
        } catch { /* noop */ }
    },
    getRefresh: () => {
        try { return localStorage.getItem(REFRESH_KEY); } catch { return null; }
    },
    setRefresh: (token) => {
        try {
            if (token) localStorage.setItem(REFRESH_KEY, token);
            else localStorage.removeItem(REFRESH_KEY);
        } catch { /* noop */ }
    },
};

export const api = axios.create({
    baseURL: API,
    withCredentials: true,
});

// Attach Bearer token as fallback when cookies are blocked
api.interceptors.request.use((config) => {
    const t = tokenStore.get();
    if (t && !config.headers?.Authorization) {
        config.headers = config.headers || {};
        config.headers.Authorization = `Bearer ${t}`;
    }
    return config;
});

// ---- Silent refresh on 401 ----
//
// Why this exists: Safari's Intelligent Tracking Prevention (and Brave shields,
// Firefox strict mode, …) silently drop SameSite=None cookies after a top-level
// cross-site navigation — typical Stripe/PayPal redirect flow. The first
// /auth/me call lands without a cookie even though the user IS still logged in.
//
// Strategy: when an authenticated call returns 401 we try ONE silent refresh
// using the refresh_token (cookie or localStorage) and replay the original
// request. Only if the refresh itself fails do we wipe the local token store.
let refreshPromise = null;

async function attemptRefresh() {
    if (refreshPromise) return refreshPromise;
    refreshPromise = (async () => {
        try {
            const body = {};
            const refresh = tokenStore.getRefresh();
            if (refresh) body.refresh_token = refresh;
            const { data } = await axios.post(`${API}/auth/refresh`, body, {
                withCredentials: true,
                headers: tokenStore.get() ? { Authorization: `Bearer ${tokenStore.get()}` } : {},
            });
            if (data.access_token) tokenStore.set(data.access_token);
            if (data.refresh_token) tokenStore.setRefresh(data.refresh_token);
            return true;
        } catch {
            return false;
        } finally {
            // Reset the lock after a short tick so concurrent failures share
            // the same refresh attempt rather than DDOS-ing the endpoint.
            setTimeout(() => { refreshPromise = null; }, 250);
        }
    })();
    return refreshPromise;
}

api.interceptors.response.use(
    (resp) => resp,
    async (error) => {
        const original = error.config || {};
        const url = original.url || "";
        // Don't try to refresh during the refresh call itself, the auth dance,
        // or after we've already retried once.
        if (
            error.response?.status === 401 &&
            !original._retry &&
            !url.includes("/auth/refresh") &&
            !url.includes("/auth/login") &&
            !url.includes("/auth/register") &&
            !url.includes("/auth/google")
        ) {
            const ok = await attemptRefresh();
            if (ok) {
                original._retry = true;
                // Make sure the replayed request uses the fresh token.
                const fresh = tokenStore.get();
                if (fresh) {
                    original.headers = original.headers || {};
                    original.headers.Authorization = `Bearer ${fresh}`;
                }
                return api(original);
            }
            // Refresh truly failed — only THEN do we wipe local state, and
            // only when the original call was the auth bootstrap. Other 401s
            // (e.g. /favorite while logged-out) shouldn't nuke the token.
            if (url.endsWith("/auth/me")) tokenStore.clear();
        }
        return Promise.reject(error);
    },
);
