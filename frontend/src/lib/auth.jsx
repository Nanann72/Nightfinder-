import { createContext, useContext, useEffect, useState, useCallback } from "react";
import { api, tokenStore } from "@/lib/api";

const AuthContext = createContext(null);

export function AuthProvider({ children }) {
    const [user, setUser] = useState(null);
    const [loading, setLoading] = useState(true);

    const checkAuth = useCallback(async () => {
        try {
            const { data } = await api.get("/auth/me");
            setUser(data);
        } catch {
            setUser(null);
        } finally {
            setLoading(false);
        }
    }, []);

    useEffect(() => {
        // Skip auth check during Google OAuth callback — AuthCallback handles it
        if (typeof window !== "undefined" && window.location.hash?.includes("session_id=")) {
            setLoading(false);
            return;
        }
        checkAuth();
    }, [checkAuth]);

    const login = async (email, password) => {
        const { data } = await api.post("/auth/login", { email, password });
        if (data.access_token) tokenStore.set(data.access_token);
        if (data.refresh_token) tokenStore.setRefresh(data.refresh_token);
        setUser(data.user);
        return data.user;
    };
    const register = async (payload) => {
        const { data } = await api.post("/auth/register", payload);
        if (data.access_token) tokenStore.set(data.access_token);
        if (data.refresh_token) tokenStore.setRefresh(data.refresh_token);
        setUser(data.user);
        return data.user;
    };
    const logout = async () => {
        try { await api.post("/auth/logout"); } catch { /* noop */ }
        tokenStore.clear();
        setUser(null);
    };

    const refreshUser = checkAuth;

    return (
        <AuthContext.Provider value={{ user, loading, login, register, logout, refreshUser, setUser }}>
            {children}
        </AuthContext.Provider>
    );
}

export const useAuth = () => useContext(AuthContext);

export function formatApiError(detail) {
    if (detail == null) return "Connexion au serveur impossible. Vérifie ton réseau ou réessaye.";
    if (typeof detail === "string") return detail;
    if (Array.isArray(detail))
        return detail.map((e) => (e && typeof e.msg === "string" ? e.msg : JSON.stringify(e))).join(" ");
    if (detail && typeof detail.msg === "string") return detail.msg;
    if (detail && typeof detail === "object") {
        // Structured business error (e.g. insufficient_coins)
        if (detail.error) return detail.error;
        try { return JSON.stringify(detail); } catch { /* noop */ }
    }
    return String(detail);
}
