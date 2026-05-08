import { useEffect, useState } from "react";
import { api } from "@/lib/api";
import { useAuth, formatApiError } from "@/lib/auth";
import { toast } from "sonner";
import { Bell, BellOff, Smartphone, Mail, Save } from "lucide-react";
import PushOptInCard from "@/components/PushOptInCard";

export default function SettingsNotifications() {
    const { refreshUser } = useAuth();
    const [emailOn, setEmailOn] = useState(true);
    const [saving, setSaving] = useState(false);
    const [err, setErr] = useState("");

    useEffect(() => {
        (async () => {
            try {
                const { data } = await api.get("/auth/me");
                setEmailOn(data.email_notifications_enabled !== false);
            } catch (e) { setErr(formatApiError(e.response?.data?.detail)); }
        })();
    }, []);

    const save = async () => {
        setSaving(true); setErr("");
        try {
            await api.patch("/users/me", { email_notifications_enabled: emailOn });
            toast.success("Préférences enregistrées ✓");
            refreshUser?.();
        } catch (e) { setErr(formatApiError(e.response?.data?.detail)); }
        finally { setSaving(false); }
    };

    return (
        <div className="space-y-6" data-testid="settings-notifications">
            <header>
                <h2 className="font-display text-2xl font-bold">Notifications</h2>
                <p className="mt-1 text-sm text-white/55">Choisis comment et quand on te contacte.</p>
            </header>

            <div className="surface-card">
                <div className="overline mb-4 flex items-center gap-1.5"><Mail size={11} /> Notifications email</div>
                <button
                    type="button"
                    onClick={() => setEmailOn(v => !v)}
                    data-testid="settings-email-toggle"
                    className={`flex w-full items-center justify-between rounded-2xl border p-4 text-left transition-colors ${
                        emailOn ? "border-magenta/40 bg-magenta/10" : "border-white/10 bg-white/[0.02]"
                    }`}
                >
                    <div className="flex items-center gap-3">
                        {emailOn ? <Bell size={16} className="text-magenta-200" /> : <BellOff size={16} className="text-white/40" />}
                        <div>
                            <div className="text-sm font-semibold text-white">
                                {emailOn ? "Recevoir les emails" : "Emails désactivés"}
                            </div>
                            <div className="text-[11px] text-white/50">
                                Nouveaux contenus, messages, abonnements et offres exclusives
                            </div>
                        </div>
                    </div>
                    <div className={`relative h-6 w-11 rounded-full transition-colors ${emailOn ? "bg-magenta" : "bg-white/10"}`}>
                        <span className={`absolute top-0.5 h-5 w-5 rounded-full bg-white transition-all ${emailOn ? "left-5" : "left-0.5"}`} />
                    </div>
                </button>
                {err && <div className="mt-4 rounded-2xl border border-red-500/30 bg-red-500/10 p-3 text-sm text-red-300">{err}</div>}
                <div className="mt-5 flex justify-end">
                    <button onClick={save} disabled={saving} className="btn-primary" data-testid="settings-notif-save">
                        <Save size={14} /> {saving ? "Enregistrement…" : "Enregistrer"}
                    </button>
                </div>
            </div>

            <div className="surface-card">
                <div className="overline mb-4 flex items-center gap-1.5"><Smartphone size={11} /> Notifications push (navigateur)</div>
                <PushOptInCard />
            </div>
        </div>
    );
}
