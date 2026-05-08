import { useEffect, useState } from "react";
import { Link } from "react-router-dom";
import { api } from "@/lib/api";
import { useAuth, formatApiError } from "@/lib/auth";
import { toast } from "sonner";
import {
    User, Mail, AtSign, Bell, BellOff, Save, ShieldCheck, AlertTriangle,
    Heart, ArrowRight, Image as ImageIcon, Lock,
} from "lucide-react";

/**
 * Fan/creator self-service profile editor.
 *
 *  - Avatar + display name (editable any time)
 *  - @username (editable ONLY ONCE — server enforces, the field disables
 *    after a successful save)
 *  - Bio
 *  - Email notification preference toggle
 *  - Quick links to "Mes abonnements" and "Mes favoris"
 *
 * Lives at /account so the navbar can deep-link fans here.
 */
export default function Account() {
    const { user, refreshUser } = useAuth();
    const [form, setForm] = useState(null);
    const [saving, setSaving] = useState(false);
    const [err, setErr] = useState("");

    useEffect(() => {
        (async () => {
            try {
                const { data } = await api.get("/auth/me");
                setForm({
                    username: data.username || "",
                    name: data.name || "",
                    avatar_url: data.avatar_url || "",
                    bio: data.bio || "",
                    email_notifications_enabled: data.email_notifications_enabled !== false,
                    username_changed: !!data.username_changed,
                    email: data.email,
                    role: data.role,
                });
            } catch (e) { setErr(formatApiError(e.response?.data?.detail)); }
        })();
    }, []);

    const save = async () => {
        if (!form) return;
        setSaving(true); setErr("");
        const patch = { name: form.name, avatar_url: form.avatar_url, bio: form.bio,
                         email_notifications_enabled: form.email_notifications_enabled };
        if (!form.username_changed && form.username) patch.username = form.username;
        try {
            const { data } = await api.patch("/users/me", patch);
            setForm((f) => ({ ...f, ...data, username_changed: data.username_changed }));
            toast.success("Profil mis à jour ✨");
            refreshUser?.();
        } catch (e) {
            setErr(formatApiError(e.response?.data?.detail));
        } finally { setSaving(false); }
    };

    const uploadAvatar = async (e) => {
        const file = e.target.files?.[0];
        if (!file) return;
        const fd = new FormData();
        fd.append("file", file);
        try {
            const { data } = await api.post("/upload", fd, { headers: { "Content-Type": "multipart/form-data" } });
            setForm((f) => ({ ...f, avatar_url: data.url }));
        } catch { toast.error("Échec upload"); }
    };

    if (!form) return <div className="container-mx py-24 text-center text-white/40">Chargement…</div>;

    return (
        <div className="container-mx py-8 max-w-3xl">
            <h1 className="font-display text-3xl font-bold">Mon profil</h1>
            <p className="mt-1 text-sm text-white/50">Gère tes informations, ton @pseudo et tes préférences.</p>

            {/* Profile editor */}
            <div className="surface-card mt-6">
                <div className="overline mb-4">Identité</div>
                <div className="flex flex-col gap-4 sm:flex-row sm:items-start">
                    <div className="relative shrink-0">
                        <div className="h-24 w-24 overflow-hidden rounded-2xl border-2 border-magenta/40 bg-magenta/15">
                            {form.avatar_url ? (
                                <img src={form.avatar_url} alt="" className="h-full w-full object-cover" />
                            ) : (
                                <div className="flex h-full w-full items-center justify-center text-3xl font-bold text-white/80">
                                    {(form.name || form.email)[0]?.toUpperCase()}
                                </div>
                            )}
                        </div>
                        <label className="absolute -bottom-2 -right-2 inline-flex h-9 w-9 cursor-pointer items-center justify-center rounded-full border border-magenta/50 bg-magenta/20 text-magenta-100 hover:bg-magenta/30">
                            <ImageIcon size={14} />
                            <input type="file" accept="image/*" onChange={uploadAvatar}
                                   data-testid="account-avatar-upload" className="hidden" />
                        </label>
                    </div>
                    <div className="flex-1 space-y-3">
                        <div>
                            <label className="text-xs text-white/50">Nom</label>
                            <div className="mt-1 flex items-center gap-2 rounded-lg border border-white/10 bg-black/30 px-3">
                                <User size={14} className="text-white/40" />
                                <input
                                    value={form.name}
                                    onChange={(e) => setForm({ ...form, name: e.target.value })}
                                    placeholder="Ton nom affiché"
                                    maxLength={80}
                                    data-testid="account-name-input"
                                    className="flex-1 bg-transparent py-2.5 text-sm text-white placeholder:text-white/30 focus:outline-none"
                                />
                            </div>
                        </div>
                        <div>
                            <label className="text-xs text-white/50 flex items-center gap-1">
                                Nom d'utilisateur (@pseudo)
                                {form.username_changed && (
                                    <span className="inline-flex items-center gap-0.5 rounded-full bg-amber-500/20 px-1.5 py-0.5 text-[10px] text-amber-200">
                                        <Lock size={9} /> Verrouillé
                                    </span>
                                )}
                            </label>
                            <div className={`mt-1 flex items-center gap-2 rounded-lg border bg-black/30 px-3 ${form.username_changed ? "border-white/5 opacity-60" : "border-white/10"}`}>
                                <AtSign size={14} className="text-white/40" />
                                <input
                                    value={form.username}
                                    onChange={(e) => setForm({ ...form, username: e.target.value.toLowerCase() })}
                                    disabled={form.username_changed}
                                    placeholder="ex: alex_fan"
                                    pattern="[a-zA-Z0-9_\.]+"
                                    minLength={3} maxLength={24}
                                    data-testid="account-username-input"
                                    className="flex-1 bg-transparent py-2.5 font-mono text-sm text-white placeholder:text-white/30 focus:outline-none"
                                />
                            </div>
                            {!form.username_changed && (
                                <p className="mt-1 flex items-center gap-1 text-[11px] text-amber-200/80">
                                    <AlertTriangle size={11} /> Tu peux le changer une seule fois. Réfléchis bien.
                                </p>
                            )}
                        </div>
                        <div>
                            <label className="text-xs text-white/50">Bio</label>
                            <textarea
                                value={form.bio}
                                onChange={(e) => setForm({ ...form, bio: e.target.value })}
                                placeholder="En quelques mots…"
                                maxLength={500}
                                rows={3}
                                data-testid="account-bio-input"
                                className="input-base mt-1 text-sm"
                            />
                        </div>
                        <div className="text-xs text-white/40">
                            <Mail size={11} className="mr-1 inline" /> {form.email} · Rôle : {form.role}
                        </div>
                    </div>
                </div>
            </div>

            {/* Notifications */}
            <div className="surface-card mt-4">
                <div className="overline mb-3">Notifications email</div>
                <button
                    type="button"
                    onClick={() => setForm({ ...form, email_notifications_enabled: !form.email_notifications_enabled })}
                    data-testid="account-notif-toggle"
                    className={`flex w-full items-center justify-between rounded-lg border p-3 text-left transition-colors ${
                        form.email_notifications_enabled
                            ? "border-magenta/40 bg-magenta/10"
                            : "border-white/10 bg-white/[0.02]"
                    }`}
                >
                    <div className="flex items-center gap-3">
                        {form.email_notifications_enabled ? <Bell size={16} className="text-magenta-200" /> : <BellOff size={16} className="text-white/40" />}
                        <div>
                            <div className="text-sm font-semibold text-white">
                                {form.email_notifications_enabled ? "Recevoir les emails" : "Emails désactivés"}
                            </div>
                            <div className="text-[11px] text-white/50">
                                Nouveaux contenus, messages et offres exclusives
                            </div>
                        </div>
                    </div>
                    <div className={`h-6 w-11 rounded-full transition-colors ${form.email_notifications_enabled ? "bg-magenta" : "bg-white/10"}`}>
                        <span className={`block h-5 w-5 translate-y-0.5 rounded-full bg-white transition-transform ${form.email_notifications_enabled ? "translate-x-5" : "translate-x-0.5"}`} />
                    </div>
                </button>
            </div>

            {err && <div className="mt-4 rounded-lg border border-red-500/30 bg-red-500/10 p-3 text-sm text-red-300">{err}</div>}

            <div className="mt-4 flex justify-end">
                <button onClick={save} disabled={saving}
                        data-testid="account-save-btn"
                        className="btn-primary">
                    <Save size={14} /> {saving ? "Enregistrement…" : "Enregistrer"}
                </button>
            </div>

            {/* Quick links — Mes abonnements + Mes favoris */}
            <div className="mt-8 grid gap-3 sm:grid-cols-2">
                <Link
                    to="/subscriptions"
                    data-testid="account-link-subs"
                    className="surface-card flex items-center justify-between gap-3 transition-colors hover:border-magenta/40"
                >
                    <div>
                        <div className="overline">Abonnements</div>
                        <div className="mt-1 font-display text-lg font-bold flex items-center gap-1.5">
                            <Heart size={14} className="text-red-300" /> Mes créatrices suivies
                        </div>
                        <div className="text-[11px] text-white/50">Gérer, désabonner, infos</div>
                    </div>
                    <ArrowRight size={16} className="text-magenta-200" />
                </Link>
                <Link
                    to="/wallet"
                    data-testid="account-link-wallet"
                    className="surface-card flex items-center justify-between gap-3 transition-colors hover:border-magenta/40"
                >
                    <div>
                        <div className="overline">Wallet</div>
                        <div className="mt-1 font-display text-lg font-bold flex items-center gap-1.5">
                            <ShieldCheck size={14} className="text-amber-300" /> Mes coins & historique
                        </div>
                        <div className="text-[11px] text-white/50">Recharger, voir les transactions</div>
                    </div>
                    <ArrowRight size={16} className="text-magenta-200" />
                </Link>
            </div>
        </div>
    );
}
