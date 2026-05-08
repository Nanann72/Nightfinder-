import { useEffect, useState } from "react";
import { api } from "@/lib/api";
import { useAuth, formatApiError } from "@/lib/auth";
import { toast } from "sonner";
import {
    ShieldCheck, Smartphone, MapPin, Clock, LogOut, AlertTriangle,
    KeyRound, Copy, Check, Loader2, Lock, X, Download
} from "lucide-react";

export default function SettingsSecurity() {
    const { user, logout } = useAuth();
    const [ua, setUa] = useState("");
    const [twoFa, setTwoFa] = useState(null);
    const [loadingStatus, setLoadingStatus] = useState(true);
    const [setupOpen, setSetupOpen] = useState(false);
    const [disableOpen, setDisableOpen] = useState(false);

    useEffect(() => {
        try {
            const u = navigator.userAgent || "";
            const browser = /Edg\//.test(u) ? "Edge" : /Chrome\//.test(u) ? "Chrome" : /Firefox\//.test(u) ? "Firefox" : /Safari\//.test(u) ? "Safari" : "Navigateur";
            const os = /Windows/.test(u) ? "Windows" : /Mac OS X/.test(u) ? "macOS" : /Android/.test(u) ? "Android" : /iPhone|iPad/.test(u) ? "iOS" : /Linux/.test(u) ? "Linux" : "—";
            setUa(`${browser} · ${os}`);
        } catch { setUa("—"); }
    }, []);

    const loadStatus = async () => {
        setLoadingStatus(true);
        try {
            const { data } = await api.get("/users/me/2fa/status");
            setTwoFa(data);
        } catch {} finally { setLoadingStatus(false); }
    };
    useEffect(() => { loadStatus(); }, []);

    return (
        <div className="space-y-6" data-testid="settings-security">
            <header>
                <h2 className="font-display text-2xl font-bold">Sécurité</h2>
                <p className="mt-1 text-sm text-white/55">Gère ta 2FA et surveille tes connexions actives.</p>
            </header>

            {/* === 2FA === */}
            <div className="surface-card" data-testid="settings-2fa-card">
                <div className="overline mb-3 flex items-center gap-1.5"><ShieldCheck size={11} /> Authentification à 2 facteurs (2FA)</div>

                {loadingStatus ? (
                    <div className="text-sm text-white/45 flex items-center gap-2"><Loader2 size={14} className="animate-spin" /> Chargement…</div>
                ) : twoFa?.enabled ? (
                    <div className="rounded-2xl border border-emerald-500/30 bg-emerald-500/[0.06] p-4">
                        <div className="flex items-start gap-3">
                            <div className="flex h-10 w-10 items-center justify-center rounded-2xl bg-emerald-500/20 text-emerald-300">
                                <Check size={18} />
                            </div>
                            <div className="flex-1">
                                <div className="font-semibold text-emerald-100">2FA activée ✓</div>
                                <div className="mt-1 text-xs text-white/55">
                                    Activée le {twoFa.enabled_at ? new Date(twoFa.enabled_at).toLocaleDateString("fr-FR") : "—"}
                                    {" · "}{twoFa.backup_codes_remaining} codes de secours restants
                                </div>
                            </div>
                            <button
                                onClick={() => setDisableOpen(true)}
                                data-testid="settings-2fa-disable-btn"
                                className="rounded-full border border-red-500/30 bg-red-500/10 px-3 py-1.5 text-xs font-semibold text-red-300 hover:bg-red-500/20"
                            >
                                Désactiver
                            </button>
                        </div>
                    </div>
                ) : (
                    <div className="rounded-2xl border border-amber-500/30 bg-amber-500/[0.05] p-4">
                        <div className="flex items-start gap-3">
                            <AlertTriangle size={16} className="mt-0.5 shrink-0 text-amber-300" />
                            <div className="flex-1">
                                <div className="font-semibold">Renforce la sécurité de ton compte</div>
                                <p className="mt-1 text-xs text-white/55 leading-relaxed">
                                    Active la 2FA pour exiger un code à 6 chiffres (Google Authenticator, Authy, 1Password) à chaque connexion.
                                </p>
                            </div>
                            <button
                                onClick={() => setSetupOpen(true)}
                                data-testid="settings-2fa-setup-btn"
                                className="btn-primary-magenta text-xs"
                            >
                                <KeyRound size={13} /> Activer
                            </button>
                        </div>
                    </div>
                )}
            </div>

            {/* === Session active === */}
            <div className="surface-card">
                <div className="overline mb-4 flex items-center gap-1.5"><Smartphone size={11} /> Session actuelle</div>
                <div className="flex items-start gap-4 rounded-2xl border border-magenta/30 bg-magenta/5 p-4">
                    <div className="flex h-11 w-11 shrink-0 items-center justify-center rounded-2xl bg-magenta/20 text-magenta-200">
                        <ShieldCheck size={20} />
                    </div>
                    <div className="flex-1 min-w-0">
                        <div className="flex items-center gap-2">
                            <span className="font-semibold">{ua}</span>
                            <span className="rounded-full border border-emerald-500/30 bg-emerald-500/10 px-2 py-0.5 text-[10px] font-bold uppercase tracking-widest text-emerald-300">Active</span>
                        </div>
                        <div className="mt-1 flex flex-wrap items-center gap-3 text-[11px] text-white/50">
                            <span className="flex items-center gap-1"><Clock size={10} /> Connecté·e maintenant</span>
                            <span className="flex items-center gap-1"><MapPin size={10} /> {user?.email}</span>
                        </div>
                    </div>
                    <button onClick={logout} data-testid="settings-logout-current"
                            className="rounded-full border border-red-500/30 bg-red-500/10 px-3 py-1.5 text-xs text-red-300 hover:bg-red-500/20">
                        <LogOut size={11} className="mr-1 inline" /> Déconnexion
                    </button>
                </div>
            </div>

            {setupOpen && <TwoFASetupModal onClose={(ok) => { setSetupOpen(false); if (ok) loadStatus(); }} />}
            {disableOpen && <TwoFADisableModal onClose={(ok) => { setDisableOpen(false); if (ok) loadStatus(); }} />}
        </div>
    );
}

function TwoFASetupModal({ onClose }) {
    const [step, setStep] = useState(1); // 1=qr, 2=verify, 3=backup
    const [secret, setSecret] = useState("");
    const [otpauth, setOtpauth] = useState("");
    const [code, setCode] = useState("");
    const [backupCodes, setBackupCodes] = useState([]);
    const [loading, setLoading] = useState(false);
    const [err, setErr] = useState("");
    const [secretCopied, setSecretCopied] = useState(false);

    useEffect(() => {
        (async () => {
            setLoading(true);
            try {
                const { data } = await api.post("/users/me/2fa/setup");
                setSecret(data.secret);
                setOtpauth(data.otpauth_uri);
            } catch (e) {
                setErr(formatApiError(e.response?.data?.detail) || e.message);
            } finally { setLoading(false); }
        })();
    }, []);

    const verify = async () => {
        setErr(""); setLoading(true);
        try {
            const { data } = await api.post("/users/me/2fa/verify", { code: code.trim().replace(/\s/g, "") });
            setBackupCodes(data.backup_codes || []);
            setStep(3);
        } catch (e) {
            setErr(formatApiError(e.response?.data?.detail) || e.message);
        } finally { setLoading(false); }
    };

    const copySecret = async () => {
        try { await navigator.clipboard.writeText(secret); setSecretCopied(true); setTimeout(() => setSecretCopied(false), 1500); } catch {}
    };

    const downloadBackup = () => {
        const text = `me&you.fans — Codes de secours 2FA\n\nGarde ces codes en lieu sûr. Chaque code n'est utilisable qu'une seule fois.\n\n${backupCodes.join("\n")}\n\nGénérés le ${new Date().toLocaleString("fr-FR")}\n`;
        const blob = new Blob([text], { type: "text/plain" });
        const url = URL.createObjectURL(blob);
        const a = document.createElement("a");
        a.href = url; a.download = "meandyou-backup-codes.txt";
        document.body.appendChild(a); a.click(); a.remove(); URL.revokeObjectURL(url);
    };

    const qrUrl = otpauth
        ? `https://api.qrserver.com/v1/create-qr-code/?size=240x240&margin=8&data=${encodeURIComponent(otpauth)}&color=ffffff&bgcolor=000000`
        : "";

    return (
        <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/85 backdrop-blur p-4" data-testid="settings-2fa-setup-modal">
            <div className="w-full max-w-md max-h-[92vh] overflow-y-auto rounded-3xl border border-magenta/40 bg-[var(--bg-surface)] p-6">
                <div className="flex items-center justify-between">
                    <h3 className="font-display text-xl font-bold flex items-center gap-2"><ShieldCheck size={18} className="text-magenta-200" /> Activer la 2FA</h3>
                    <button onClick={() => onClose(false)} className="rounded-full p-1 text-white/50 hover:bg-white/5"><X size={16} /></button>
                </div>

                {/* Stepper */}
                <div className="mt-3 flex gap-1">
                    {[1, 2, 3].map(n => (
                        <div key={n} className={`h-0.5 flex-1 rounded-full transition-colors ${n <= step ? "bg-magenta" : "bg-white/10"}`} />
                    ))}
                </div>

                {/* STEP 1 — QR code */}
                {step === 1 && (
                    <div className="mt-5">
                        <p className="text-sm text-white/65">
                            <strong>1.</strong> Ouvre ton appli authenticator (Google Authenticator, Authy, 1Password) et scanne ce QR code.
                        </p>
                        <div className="mt-4 flex justify-center">
                            {loading || !qrUrl ? (
                                <div className="flex h-60 w-60 items-center justify-center rounded-2xl border border-white/10 bg-black"><Loader2 className="animate-spin text-magenta" /></div>
                            ) : (
                                <img src={qrUrl} alt="QR 2FA" className="rounded-2xl border border-white/10" data-testid="settings-2fa-qr" />
                            )}
                        </div>
                        <div className="mt-4">
                            <div className="overline mb-1.5">Ou saisis ce code manuellement</div>
                            <button
                                onClick={copySecret}
                                data-testid="settings-2fa-copy-secret"
                                className="flex w-full items-center justify-between gap-3 rounded-2xl border border-white/10 bg-black px-4 py-3 font-mono text-sm tracking-wider hover:border-magenta/40"
                            >
                                <span className="break-all text-white">{secret || "—"}</span>
                                {secretCopied ? <Check size={14} className="text-emerald-300 shrink-0" /> : <Copy size={14} className="text-white/40 shrink-0" />}
                            </button>
                        </div>
                        {err && <div className="mt-3 rounded-xl border border-red-500/30 bg-red-500/10 p-3 text-xs text-red-300">{err}</div>}
                        <button onClick={() => setStep(2)} disabled={loading || !secret}
                                data-testid="settings-2fa-step1-next"
                                className="btn-primary-magenta mt-5 w-full justify-center disabled:opacity-40">
                            J'ai scanné — Suivant
                        </button>
                    </div>
                )}

                {/* STEP 2 — Verify code */}
                {step === 2 && (
                    <div className="mt-5">
                        <p className="text-sm text-white/65">
                            <strong>2.</strong> Entre le code à 6 chiffres affiché par ton appli.
                        </p>
                        <input
                            value={code}
                            onChange={(e) => setCode(e.target.value.replace(/[^0-9]/g, "").slice(0, 8))}
                            placeholder="123 456"
                            maxLength={8}
                            inputMode="numeric"
                            autoComplete="one-time-code"
                            data-testid="settings-2fa-code"
                            className="input-base mt-4 text-center font-mono text-2xl tracking-[0.5em]"
                        />
                        {err && <div className="mt-3 rounded-xl border border-red-500/30 bg-red-500/10 p-3 text-xs text-red-300" data-testid="settings-2fa-verify-error">{err}</div>}
                        <div className="mt-5 flex gap-2">
                            <button onClick={() => setStep(1)} className="btn-ghost flex-1 justify-center" data-testid="settings-2fa-step2-back">
                                Retour
                            </button>
                            <button onClick={verify} disabled={loading || code.length < 6}
                                    data-testid="settings-2fa-verify"
                                    className="btn-primary-magenta flex-1 justify-center disabled:opacity-40">
                                {loading ? <Loader2 size={14} className="animate-spin" /> : <Check size={14} />}
                                Vérifier
                            </button>
                        </div>
                    </div>
                )}

                {/* STEP 3 — Backup codes */}
                {step === 3 && (
                    <div className="mt-5">
                        <div className="rounded-2xl border border-emerald-500/30 bg-emerald-500/[0.05] p-3 flex items-start gap-2">
                            <Check size={14} className="mt-0.5 shrink-0 text-emerald-300" />
                            <div className="text-xs text-emerald-100">2FA activée avec succès.</div>
                        </div>
                        <p className="mt-4 text-sm text-white/65">
                            <strong>3.</strong> Voici tes <strong>8 codes de secours</strong>. Stocke-les en lieu sûr —
                            tu en auras besoin si tu perds ton téléphone. Chaque code n'est utilisable qu'une seule fois.
                        </p>
                        <div className="mt-3 grid grid-cols-2 gap-2 rounded-2xl border border-amber-500/30 bg-amber-500/[0.03] p-3" data-testid="settings-2fa-backup-codes">
                            {backupCodes.map((c, i) => (
                                <code key={i} className="rounded-lg bg-black/50 px-3 py-2 text-center font-mono text-xs tracking-wider">{c}</code>
                            ))}
                        </div>
                        <button onClick={downloadBackup}
                                data-testid="settings-2fa-download-backup"
                                className="btn-ghost mt-4 w-full justify-center">
                            <Download size={13} /> Télécharger les codes
                        </button>
                        <button onClick={() => onClose(true)}
                                data-testid="settings-2fa-finish"
                                className="btn-primary-magenta mt-2 w-full justify-center">
                            Terminé
                        </button>
                    </div>
                )}
            </div>
        </div>
    );
}

function TwoFADisableModal({ onClose }) {
    const [password, setPassword] = useState("");
    const [loading, setLoading] = useState(false);
    const [err, setErr] = useState("");

    const submit = async () => {
        setErr(""); setLoading(true);
        try {
            await api.post("/users/me/2fa/disable", { password });
            toast.success("2FA désactivée");
            onClose(true);
        } catch (e) {
            setErr(formatApiError(e.response?.data?.detail) || e.message);
            setLoading(false);
        }
    };

    return (
        <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/85 backdrop-blur p-4" data-testid="settings-2fa-disable-modal">
            <div className="w-full max-w-md rounded-3xl border border-red-500/40 bg-[var(--bg-surface)] p-6">
                <div className="flex items-center justify-between">
                    <h3 className="font-display text-xl font-bold flex items-center gap-2"><AlertTriangle size={18} className="text-red-300" /> Désactiver la 2FA</h3>
                    <button onClick={() => onClose(false)} className="rounded-full p-1 text-white/50 hover:bg-white/5"><X size={16} /></button>
                </div>
                <p className="mt-3 text-sm text-white/65">
                    Entre ton mot de passe pour confirmer la désactivation. Ton compte sera moins sécurisé.
                </p>
                <input
                    type="password"
                    value={password}
                    onChange={(e) => setPassword(e.target.value)}
                    placeholder="Mot de passe actuel"
                    data-testid="settings-2fa-disable-password"
                    className="input-base mt-4"
                />
                {err && <div className="mt-3 rounded-xl border border-red-500/30 bg-red-500/10 p-3 text-xs text-red-300">{err}</div>}
                <div className="mt-5 flex gap-2">
                    <button onClick={() => onClose(false)} className="btn-ghost flex-1 justify-center">
                        Annuler
                    </button>
                    <button onClick={submit} disabled={loading || !password}
                            data-testid="settings-2fa-disable-confirm"
                            className="inline-flex flex-1 items-center justify-center gap-2 rounded-full border border-red-500/50 bg-red-500/15 px-4 py-3 text-sm font-semibold text-red-200 hover:bg-red-500/25 disabled:opacity-40">
                        {loading ? <Loader2 size={14} className="animate-spin" /> : <Lock size={14} />}
                        Désactiver
                    </button>
                </div>
            </div>
        </div>
    );
}
