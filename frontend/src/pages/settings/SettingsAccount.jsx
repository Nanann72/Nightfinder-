import { useState } from "react";
import { api } from "@/lib/api";
import { useAuth, formatApiError } from "@/lib/auth";
import { toast } from "sonner";
import { Mail, KeyRound, Save, Eye, EyeOff } from "lucide-react";

export default function SettingsAccount() {
    const { user } = useAuth();
    const [pwd, setPwd] = useState({ current: "", next: "", confirm: "" });
    const [show, setShow] = useState({ current: false, next: false });
    const [saving, setSaving] = useState(false);
    const [err, setErr] = useState("");

    const submit = async (e) => {
        e.preventDefault(); setErr("");
        if (pwd.next.length < 6) { setErr("Minimum 6 caractères."); return; }
        if (pwd.next !== pwd.confirm) { setErr("Les mots de passe ne correspondent pas."); return; }
        setSaving(true);
        try {
            await api.patch("/users/me/password", { current_password: pwd.current, new_password: pwd.next });
            toast.success("Mot de passe mis à jour ✓");
            setPwd({ current: "", next: "", confirm: "" });
        } catch (e) {
            setErr(formatApiError(e.response?.data?.detail) || e.message);
        } finally { setSaving(false); }
    };

    return (
        <div className="space-y-6" data-testid="settings-account">
            <header>
                <h2 className="font-display text-2xl font-bold">Email & mot de passe</h2>
                <p className="mt-1 text-sm text-white/55">Tes identifiants de connexion.</p>
            </header>

            <div className="surface-card">
                <div className="overline mb-3">Email</div>
                <div className="flex items-center gap-3 rounded-2xl border border-white/5 bg-white/[0.02] p-4">
                    <Mail size={16} className="text-white/40" />
                    <div className="flex-1 min-w-0">
                        <div className="font-mono text-sm truncate">{user?.email}</div>
                        <div className="text-[11px] text-white/40">Email vérifié · contact-us pour changer</div>
                    </div>
                </div>
            </div>

            <form onSubmit={submit} className="surface-card" data-testid="settings-password-form">
                <div className="overline mb-4">Mot de passe</div>
                <div className="space-y-4">
                    <PwdField label="Mot de passe actuel" value={pwd.current} onChange={v => setPwd(p => ({ ...p, current: v }))}
                              show={show.current} toggle={() => setShow(s => ({ ...s, current: !s.current }))}
                              testId="settings-pwd-current" />
                    <PwdField label="Nouveau mot de passe" value={pwd.next} onChange={v => setPwd(p => ({ ...p, next: v }))}
                              show={show.next} toggle={() => setShow(s => ({ ...s, next: !s.next }))}
                              testId="settings-pwd-next" />
                    <PwdField label="Confirme le nouveau mot de passe" value={pwd.confirm} onChange={v => setPwd(p => ({ ...p, confirm: v }))}
                              show={show.next} toggle={() => {}} hideToggle
                              testId="settings-pwd-confirm" />
                </div>
                {err && <div className="mt-4 rounded-2xl border border-red-500/30 bg-red-500/10 p-3 text-sm text-red-300" data-testid="settings-pwd-error">{err}</div>}
                <div className="mt-5 flex justify-end">
                    <button type="submit" disabled={saving || !pwd.current || !pwd.next}
                            data-testid="settings-pwd-save"
                            className="btn-primary disabled:opacity-40 disabled:cursor-not-allowed">
                        <Save size={14} /> {saving ? "Mise à jour…" : "Mettre à jour"}
                    </button>
                </div>
            </form>
        </div>
    );
}

function PwdField({ label, value, onChange, show, toggle, hideToggle, testId }) {
    return (
        <div>
            <label className="text-xs text-white/55">{label}</label>
            <div className="mt-1.5 flex items-center gap-2 rounded-2xl border border-white/10 bg-white/[0.03] px-4">
                <KeyRound size={14} className="text-white/40" />
                <input
                    type={show ? "text" : "password"}
                    value={value}
                    onChange={(e) => onChange(e.target.value)}
                    minLength={6} maxLength={128}
                    data-testid={testId}
                    className="flex-1 bg-transparent py-3 text-sm text-white placeholder:text-white/30 focus:outline-none"
                />
                {!hideToggle && (
                    <button type="button" onClick={toggle} className="p-1 text-white/40 hover:text-white">
                        {show ? <EyeOff size={14} /> : <Eye size={14} />}
                    </button>
                )}
            </div>
        </div>
    );
}
