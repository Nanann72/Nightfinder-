import { useEffect, useState } from "react";
import { api } from "@/lib/api";
import { useAuth, formatApiError } from "@/lib/auth";
import { toast } from "sonner";
import { User, AtSign, Image as ImageIcon, Save, AlertTriangle, Lock, Mail } from "lucide-react";

export default function SettingsProfile() {
    const { refreshUser } = useAuth();
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
        const patch = { name: form.name, avatar_url: form.avatar_url, bio: form.bio };
        if (!form.username_changed && form.username) patch.username = form.username;
        try {
            const { data } = await api.patch("/users/me", patch);
            setForm(f => ({ ...f, ...data, username_changed: data.username_changed }));
            toast.success("Profil mis à jour ✨");
            refreshUser?.();
        } catch (e) { setErr(formatApiError(e.response?.data?.detail)); }
        finally { setSaving(false); }
    };

    const uploadAvatar = async (e) => {
        const file = e.target.files?.[0];
        if (!file) return;
        const fd = new FormData();
        fd.append("file", file);
        try {
            const { data } = await api.post("/upload", fd, { headers: { "Content-Type": "multipart/form-data" } });
            setForm(f => ({ ...f, avatar_url: data.url }));
        } catch { toast.error("Échec upload"); }
    };

    if (!form) return <div className="text-white/40">Chargement…</div>;

    return (
        <div className="space-y-6" data-testid="settings-profile">
            <header>
                <h2 className="font-display text-2xl font-bold">Profil public</h2>
                <p className="mt-1 text-sm text-white/55">Ces informations sont visibles par les autres utilisateur·rice·s.</p>
            </header>

            <div className="surface-card">
                <div className="flex flex-col gap-6 sm:flex-row sm:items-start">
                    <div className="relative shrink-0">
                        <div className="h-28 w-28 overflow-hidden rounded-3xl border-2 border-magenta/40 bg-magenta/15">
                            {form.avatar_url ? (
                                <img src={form.avatar_url} alt="" className="h-full w-full object-cover" />
                            ) : (
                                <div className="flex h-full w-full items-center justify-center text-4xl font-bold text-white/80">
                                    {(form.name || form.email)[0]?.toUpperCase()}
                                </div>
                            )}
                        </div>
                        <label className="absolute -bottom-2 -right-2 inline-flex h-10 w-10 cursor-pointer items-center justify-center rounded-full border border-magenta/50 bg-magenta/30 text-white hover:bg-magenta/40 transition-colors">
                            <ImageIcon size={16} />
                            <input type="file" accept="image/*" onChange={uploadAvatar}
                                   data-testid="settings-avatar-upload" className="hidden" />
                        </label>
                    </div>
                    <div className="flex-1 space-y-4">
                        <div>
                            <label className="text-xs text-white/55">Nom affiché</label>
                            <div className="mt-1.5 flex items-center gap-2 rounded-2xl border border-white/10 bg-white/[0.03] px-4">
                                <User size={14} className="text-white/40" />
                                <input
                                    value={form.name}
                                    onChange={(e) => setForm({ ...form, name: e.target.value })}
                                    placeholder="Ton nom affiché"
                                    maxLength={80}
                                    data-testid="settings-name"
                                    className="flex-1 bg-transparent py-3 text-sm text-white placeholder:text-white/30 focus:outline-none"
                                />
                            </div>
                        </div>
                        <div>
                            <label className="text-xs text-white/55 flex items-center gap-1.5">
                                Pseudo (@username)
                                {form.username_changed && (
                                    <span className="inline-flex items-center gap-0.5 rounded-full bg-amber-500/20 px-1.5 py-0.5 text-[10px] text-amber-200">
                                        <Lock size={9} /> Verrouillé
                                    </span>
                                )}
                            </label>
                            <div className={`mt-1.5 flex items-center gap-2 rounded-2xl border px-4 ${form.username_changed ? "border-white/5 bg-white/[0.02] opacity-60" : "border-white/10 bg-white/[0.03]"}`}>
                                <AtSign size={14} className="text-white/40" />
                                <input
                                    value={form.username}
                                    onChange={(e) => setForm({ ...form, username: e.target.value.toLowerCase() })}
                                    disabled={form.username_changed}
                                    placeholder="ex: alex_fan"
                                    pattern="[a-zA-Z0-9_\.]+"
                                    minLength={3} maxLength={24}
                                    data-testid="settings-username"
                                    className="flex-1 bg-transparent py-3 font-mono text-sm text-white placeholder:text-white/30 focus:outline-none"
                                />
                            </div>
                            {!form.username_changed && (
                                <p className="mt-1.5 flex items-center gap-1 text-[11px] text-amber-200/80">
                                    <AlertTriangle size={11} /> Changement possible une seule fois.
                                </p>
                            )}
                        </div>
                        <div>
                            <label className="text-xs text-white/55">Bio</label>
                            <textarea
                                value={form.bio}
                                onChange={(e) => setForm({ ...form, bio: e.target.value })}
                                placeholder="En quelques mots…"
                                maxLength={500}
                                rows={3}
                                data-testid="settings-bio"
                                className="input-base mt-1.5 text-sm"
                            />
                            <div className="mt-1 text-[11px] text-white/35 text-right">{form.bio.length}/500</div>
                        </div>
                        <div className="flex items-center gap-2 text-xs text-white/40">
                            <Mail size={11} /> {form.email} · Rôle : {form.role}
                        </div>
                    </div>
                </div>
            </div>

            {err && <div className="rounded-2xl border border-red-500/30 bg-red-500/10 p-3 text-sm text-red-300" data-testid="settings-profile-error">{err}</div>}

            <div className="flex justify-end">
                <button onClick={save} disabled={saving} data-testid="settings-profile-save" className="btn-primary">
                    <Save size={14} /> {saving ? "Enregistrement…" : "Enregistrer"}
                </button>
            </div>
        </div>
    );
}
