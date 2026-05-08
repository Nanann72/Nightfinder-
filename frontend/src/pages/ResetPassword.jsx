import { useState } from "react";
import { Link, useSearchParams, useNavigate } from "react-router-dom";
import { api } from "@/lib/api";
import { formatApiError } from "@/lib/auth";
import { KeyRound, CheckCircle2, XCircle } from "lucide-react";

export default function ResetPassword() {
    const [sp] = useSearchParams();
    const nav = useNavigate();
    const token = sp.get("token") || "";
    const [password, setPassword] = useState("");
    const [confirm, setConfirm] = useState("");
    const [loading, setLoading] = useState(false);
    const [err, setErr] = useState("");
    const [done, setDone] = useState(false);

    const submit = async (e) => {
        e.preventDefault(); setErr("");
        if (password.length < 6) { setErr("Le mot de passe doit faire au moins 6 caractères"); return; }
        if (password !== confirm) { setErr("Les mots de passe ne correspondent pas"); return; }
        setLoading(true);
        try {
            await api.post("/auth/reset-password", { token, new_password: password });
            setDone(true);
            setTimeout(() => nav("/login"), 2500);
        } catch (e) {
            setErr(formatApiError(e.response?.data?.detail) || e.message);
        } finally { setLoading(false); }
    };

    if (!token) {
        return (
            <div className="container-mx py-16">
                <div className="mx-auto max-w-md surface-card p-8 text-center" data-testid="reset-no-token">
                    <XCircle size={40} className="mx-auto text-red-400" />
                    <h1 className="mt-4 font-display text-2xl font-bold">Lien invalide</h1>
                    <p className="mt-2 text-sm text-white/60">Ce lien de réinitialisation est invalide ou incomplet.</p>
                    <Link to="/forgot-password" className="btn-primary mt-6 inline-flex">Demander un nouveau lien</Link>
                </div>
            </div>
        );
    }

    return (
        <div className="relative z-10 container-mx py-16" data-testid="reset-password-page">
            <div className="mx-auto max-w-md">
                <div className="surface-card p-8">
                    {!done ? (
                        <>
                            <div className="overline">Réinitialisation</div>
                            <h1 className="mt-2 font-display text-3xl font-bold">Nouveau mot de passe</h1>
                            <p className="mt-2 text-sm text-white/60">Choisis un nouveau mot de passe sécurisé pour ton compte me&you.</p>

                            <form onSubmit={submit} className="mt-6 space-y-4">
                                <div>
                                    <label className="mb-1 block text-xs text-white/60">Nouveau mot de passe</label>
                                    <input
                                        data-testid="reset-password"
                                        type="password"
                                        required
                                        minLength={6}
                                        value={password}
                                        onChange={e => setPassword(e.target.value)}
                                        className="input-base"
                                        placeholder="Au moins 6 caractères"
                                        autoFocus
                                    />
                                </div>
                                <div>
                                    <label className="mb-1 block text-xs text-white/60">Confirmer le mot de passe</label>
                                    <input
                                        data-testid="reset-confirm"
                                        type="password"
                                        required
                                        minLength={6}
                                        value={confirm}
                                        onChange={e => setConfirm(e.target.value)}
                                        className="input-base"
                                        placeholder="Retape le même mot de passe"
                                    />
                                </div>
                                {err && <div data-testid="reset-error" className="rounded-lg border border-red-500/30 bg-red-500/10 p-3 text-sm text-red-300">{err}</div>}
                                <button data-testid="reset-submit" disabled={loading} className="btn-primary w-full justify-center">
                                    <KeyRound size={14} /> {loading ? "Mise à jour…" : "Mettre à jour le mot de passe"}
                                </button>
                            </form>
                        </>
                    ) : (
                        <div className="py-4 text-center" data-testid="reset-success">
                            <div className="mx-auto flex h-14 w-14 items-center justify-center rounded-full bg-green-500/15 text-green-300">
                                <CheckCircle2 size={28} />
                            </div>
                            <h2 className="mt-5 font-display text-xl font-bold">Mot de passe mis à jour 🎉</h2>
                            <p className="mt-2 text-sm text-white/60">Tu vas être redirigé·e vers la connexion.</p>
                        </div>
                    )}
                </div>
            </div>
        </div>
    );
}
