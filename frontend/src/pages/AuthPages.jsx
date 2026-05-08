import { useEffect, useState } from "react";
import { Link, useNavigate, useSearchParams } from "react-router-dom";
import { useTranslation } from "react-i18next";
import { useAuth, formatApiError } from "@/lib/auth";
import { api } from "@/lib/api";
import { Gift, CheckCircle2 } from "lucide-react";

function GoogleButton() {
    const { t } = useTranslation();
    const [direct, setDirect] = useState(null); // null=loading, true|false once known
    const [clientId, setClientId] = useState(null);

    useEffect(() => {
        let mounted = true;
        api.get("/auth/google/config")
            .then(r => { if (mounted) { setDirect(!!r.data?.direct); setClientId(r.data?.client_id || null); } })
            .catch(() => { if (mounted) setDirect(false); });
        return () => { mounted = false; };
    }, []);

    const go = () => {
        // REMINDER: DO NOT HARDCODE THE URL, OR ADD ANY FALLBACKS OR REDIRECT URLS, THIS BREAKS THE AUTH
        if (direct && clientId) {
            // Direct Google OAuth authorization-code flow
            const redirectUri = window.location.origin + "/auth/google";
            const state = Math.random().toString(36).slice(2) + Date.now();
            sessionStorage.setItem("g_oauth_state", state);
            const params = new URLSearchParams({
                client_id: clientId,
                redirect_uri: redirectUri,
                response_type: "code",
                scope: "openid email profile",
                access_type: "online",
                prompt: "select_account",
                state,
            });
            window.location.href = `https://accounts.google.com/o/oauth2/v2/auth?${params.toString()}`;
        } else {
            // Fallback to Emergent managed Google OAuth
            const redirectUrl = window.location.origin + "/auth/callback";
            window.location.href = `https://auth.emergentagent.com/?redirect=${encodeURIComponent(redirectUrl)}`;
        }
    };
    return (
        <button data-testid="google-auth-btn" onClick={go} disabled={direct === null} className="btn-ghost w-full justify-center">
            <svg viewBox="0 0 24 24" className="h-5 w-5" aria-hidden>
                <path fill="#EA4335" d="M12 10.2v3.9h5.5c-.24 1.3-1.7 3.8-5.5 3.8-3.3 0-6-2.7-6-6s2.7-6 6-6c1.9 0 3.1.8 3.8 1.5l2.6-2.5C16.8 3.3 14.6 2.3 12 2.3 6.9 2.3 2.7 6.5 2.7 11.6S6.9 20.9 12 20.9c6.9 0 9.5-4.8 9.5-7.3 0-.5 0-.9-.1-1.3H12z" />
            </svg>
            {t("auth.continue_google")}
        </button>
    );
}

export function LoginPage() {
    const { login } = useAuth();
    const { t } = useTranslation();
    const nav = useNavigate();
    const [email, setEmail] = useState("");
    const [password, setPassword] = useState("");
    const [err, setErr] = useState("");
    const [loading, setLoading] = useState(false);

    const submit = async (e) => {
        e.preventDefault();
        setErr(""); setLoading(true);
        try {
            await login(email, password);
            nav("/createurs");
        } catch (e) {
            const detail = e.response?.data?.detail;
            if (detail) setErr(formatApiError(detail));
            else if (e.response?.status === 401) setErr(t("auth.err.invalid"));
            else if (e.code === "ERR_NETWORK") setErr(t("auth.err.network"));
            else setErr(formatApiError(detail) || e.message || t("auth.err.unexpected"));
        } finally { setLoading(false); }
    };

    return (
        <div className="relative z-10 container-mx py-16">
            <div className="mx-auto max-w-md">
                <div className="surface-card p-8">
                    <div className="overline">{t("auth.login.title")}</div>
                    <h1 className="mt-2 font-display text-3xl font-bold">{t("auth.login.title")}</h1>
                    <p className="mt-2 text-sm text-white/50">{t("auth.login.subtitle")}</p>

                    <form onSubmit={submit} className="mt-6 space-y-4">
                        <div>
                            <label className="mb-1 block text-xs text-white/60">{t("auth.email")}</label>
                            <input data-testid="login-email" type="email" required value={email} onChange={e => setEmail(e.target.value)} className="input-base" placeholder="you@example.com" />
                        </div>
                        <div>
                            <div className="flex items-center justify-between">
                                <label className="mb-1 block text-xs text-white/60">{t("auth.password")}</label>
                                <Link to="/forgot-password" data-testid="login-forgot-link" className="mb-1 text-xs text-magenta-200 hover:text-white">
                                    {t("auth.forgot_password")}
                                </Link>
                            </div>
                            <input data-testid="login-password" type="password" required value={password} onChange={e => setPassword(e.target.value)} className="input-base" placeholder="••••••••" />
                        </div>
                        {err && <div data-testid="login-error" className="rounded-lg border border-red-500/30 bg-red-500/10 p-3 text-sm text-red-300">{err}</div>}
                        <button data-testid="login-submit" disabled={loading} className="btn-primary w-full justify-center">
                            {loading ? t("action.loading") : t("auth.submit.login")}
                        </button>
                    </form>
                    <div className="my-6 flex items-center gap-3 text-xs text-white/30">
                        <div className="h-px flex-1 bg-white/10" /> {t("auth.or").toUpperCase()} <div className="h-px flex-1 bg-white/10" />
                    </div>
                    <GoogleButton />
                    <p className="mt-6 text-center text-sm text-white/60">
                        {t("auth.no_account")} <Link to="/register" data-testid="login-to-register" className="font-semibold text-magenta-200 hover:text-white">{t("nav.signup")}</Link>
                    </p>
                </div>
            </div>
        </div>
    );
}

export function RegisterPage() {
    const { register } = useAuth();
    const { t } = useTranslation();
    const nav = useNavigate();
    const [sp] = useSearchParams();
    const defaultCreator = sp.get("creator") === "1";
    const refFromQuery = (sp.get("ref") || "").toUpperCase().slice(0, 6);
    const [form, setForm] = useState({ email: "", password: "", name: "", is_creator: defaultCreator, referral_code: refFromQuery, newsletter_opt_in: true });
    const [err, setErr] = useState("");
    const [loading, setLoading] = useState(false);
    const [refInfo, setRefInfo] = useState(null);
    const [refErr, setRefErr] = useState("");

    useEffect(() => {
        const code = (form.referral_code || "").trim().toUpperCase();
        if (code.length !== 6) { setRefInfo(null); setRefErr(""); return; }
        let cancel = false;
        api.get(`/referral/validate/${encodeURIComponent(code)}`)
            .then(r => { if (!cancel) { setRefInfo(r.data); setRefErr(""); } })
            .catch(() => { if (!cancel) { setRefInfo(null); setRefErr(t("auth.referral.invalid")); } });
        return () => { cancel = true; };
    }, [form.referral_code, t]);

    const submit = async (e) => {
        e.preventDefault();
        setErr(""); setLoading(true);
        try {
            const payload = { ...form };
            if (!payload.referral_code) delete payload.referral_code;
            const user = await register(payload);
            nav(user.role === "creator" ? "/dashboard" : "/createurs");
        } catch (e) {
            const detail = e.response?.data?.detail;
            if (detail) setErr(formatApiError(detail));
            else if (e.code === "ERR_NETWORK") setErr(t("auth.err.network"));
            else setErr(formatApiError(detail) || e.message || t("auth.err.unexpected"));
        } finally { setLoading(false); }
    };

    return (
        <div className="relative z-10 container-mx py-16">
            <div className="mx-auto max-w-md">
                <div className="surface-card p-8">
                    <div className="overline">{t("auth.register.title")}</div>
                    <h1 className="mt-2 font-display text-3xl font-bold">{t("auth.register.heading")}</h1>
                    <p className="mt-2 text-sm text-white/50">{t("auth.register.subtitle_short")}</p>

                    {refInfo && (
                        <div className="mt-5 flex items-start gap-2 rounded-lg border border-magenta/30 bg-magenta/10 p-3 text-sm" data-testid="referral-banner">
                            <Gift size={16} className="mt-0.5 text-magenta-200 shrink-0" />
                            <div>
                                <div className="text-white" dangerouslySetInnerHTML={{ __html: t("auth.register.referral_banner.title", { name: refInfo.referrer_name }) }} />
                                <div className="text-xs text-white/60">{t("auth.register.referral_banner.desc", { bonus: refInfo.bonus })}</div>
                            </div>
                        </div>
                    )}

                    <form onSubmit={submit} className="mt-6 space-y-4">
                        <div>
                            <label className="mb-1 block text-xs text-white/60">{t("auth.name.placeholder")}</label>
                            <input data-testid="register-name" type="text" required minLength={1} value={form.name} onChange={e => setForm({ ...form, name: e.target.value })} className="input-base" placeholder="Alex" />
                        </div>
                        <div>
                            <label className="mb-1 block text-xs text-white/60">{t("auth.email")}</label>
                            <input data-testid="register-email" type="email" required value={form.email} onChange={e => setForm({ ...form, email: e.target.value })} className="input-base" placeholder="you@example.com" />
                        </div>
                        <div>
                            <label className="mb-1 block text-xs text-white/60">{t("auth.password")}</label>
                            <input data-testid="register-password" type="password" required minLength={6} value={form.password} onChange={e => setForm({ ...form, password: e.target.value })} className="input-base" placeholder="••••••" />
                        </div>
                        <div>
                            <label className="mb-1 block text-xs text-white/60">{t("auth.referral_code")}</label>
                            <div className="relative">
                                <input
                                    data-testid="register-referral-code"
                                    type="text"
                                    maxLength={6}
                                    value={form.referral_code}
                                    onChange={e => setForm({ ...form, referral_code: e.target.value.toUpperCase().replace(/[^A-Z0-9]/g, "").slice(0, 6) })}
                                    className="input-base font-mono uppercase tracking-widest"
                                    placeholder="ABCDEF"
                                />
                                {refInfo && (
                                    <CheckCircle2 size={16} className="absolute right-3 top-1/2 -translate-y-1/2 text-magenta-200" />
                                )}
                            </div>
                            {refErr && <p className="mt-1 text-xs text-amber-300" data-testid="referral-invalid">{refErr}</p>}
                        </div>
                        <label className="flex items-center gap-2 text-sm text-white/70">
                            <input data-testid="register-is-creator" type="checkbox" checked={form.is_creator} onChange={e => setForm({ ...form, is_creator: e.target.checked })} className="h-4 w-4 accent-magenta" />
                            {t("auth.is_creator")}
                        </label>
                        <label className="flex items-start gap-2 text-sm text-white/70">
                            <input data-testid="register-newsletter-opt-in" type="checkbox" checked={form.newsletter_opt_in} onChange={e => setForm({ ...form, newsletter_opt_in: e.target.checked })} className="mt-0.5 h-4 w-4 accent-magenta" />
                            <span className="leading-snug">
                                {t("auth.newsletter.label")}
                                <span className="block text-[11px] text-white/40">{t("auth.newsletter.hint")}</span>
                            </span>
                        </label>
                        {err && <div data-testid="register-error" className="rounded-lg border border-red-500/30 bg-red-500/10 p-3 text-sm text-red-300">{err}</div>}
                        <button data-testid="register-submit" disabled={loading} className="btn-primary w-full justify-center">
                            {loading ? t("action.loading") : t("auth.submit.register")}
                        </button>
                    </form>
                    <div className="my-6 flex items-center gap-3 text-xs text-white/30">
                        <div className="h-px flex-1 bg-white/10" /> {t("auth.or").toUpperCase()} <div className="h-px flex-1 bg-white/10" />
                    </div>
                    <GoogleButton />
                    <p className="mt-6 text-center text-sm text-white/60">
                        {t("auth.have_account")} <Link to="/login" data-testid="register-to-login" className="font-semibold text-magenta-200 hover:text-white">{t("auth.login.title")}</Link>
                    </p>
                </div>
            </div>
        </div>
    );
}
