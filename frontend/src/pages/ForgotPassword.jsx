import { useState } from "react";
import { Link } from "react-router-dom";
import { api } from "@/lib/api";
import { formatApiError } from "@/lib/auth";
import { Mail, ArrowLeft, CheckCircle2 } from "lucide-react";

export default function ForgotPassword() {
    const [email, setEmail] = useState("");
    const [sent, setSent] = useState(false);
    const [loading, setLoading] = useState(false);
    const [err, setErr] = useState("");

    const submit = async (e) => {
        e.preventDefault(); setErr(""); setLoading(true);
        try {
            await api.post("/auth/forgot-password", { email });
            setSent(true);
        } catch (e) {
            setErr(formatApiError(e.response?.data?.detail) || e.message);
        } finally { setLoading(false); }
    };

    return (
        <div className="relative z-10 container-mx py-16" data-testid="forgot-password-page">
            <div className="mx-auto max-w-md">
                <div className="surface-card p-8">
                    <Link to="/login" className="inline-flex items-center gap-1 text-xs text-white/50 hover:text-white" data-testid="back-to-login">
                        <ArrowLeft size={12} /> Retour à la connexion
                    </Link>

                    {!sent ? (
                        <>
                            <div className="mt-4 overline">Mot de passe oublié</div>
                            <h1 className="mt-2 font-display text-3xl font-bold">Réinitialiser ton mot de passe</h1>
                            <p className="mt-2 text-sm text-white/60">Entre ton email et on t'envoie un lien sécurisé pour choisir un nouveau mot de passe.</p>

                            <form onSubmit={submit} className="mt-6 space-y-4">
                                <div>
                                    <label className="mb-1 block text-xs text-white/60">Email</label>
                                    <input
                                        data-testid="forgot-email"
                                        type="email"
                                        required
                                        value={email}
                                        onChange={e => setEmail(e.target.value)}
                                        className="input-base"
                                        placeholder="toi@exemple.com"
                                        autoFocus
                                    />
                                </div>
                                {err && <div data-testid="forgot-error" className="rounded-lg border border-red-500/30 bg-red-500/10 p-3 text-sm text-red-300">{err}</div>}
                                <button data-testid="forgot-submit" disabled={loading} className="btn-primary w-full justify-center">
                                    <Mail size={14} /> {loading ? "Envoi en cours…" : "Envoyer le lien"}
                                </button>
                            </form>
                        </>
                    ) : (
                        <div className="py-4 text-center" data-testid="forgot-success">
                            <div className="mx-auto flex h-14 w-14 items-center justify-center rounded-full bg-green-500/15 text-green-300">
                                <CheckCircle2 size={28} />
                            </div>
                            <h2 className="mt-5 font-display text-xl font-bold">Email envoyé ✨</h2>
                            <p className="mt-2 text-sm text-white/60">
                                Si un compte existe pour <strong className="text-white">{email}</strong>, tu recevras un email avec un lien pour réinitialiser ton mot de passe.
                            </p>
                            <p className="mt-3 text-xs text-white/40">
                                Le lien est valide 1 heure. Pense à vérifier aussi les spams.
                            </p>
                            <Link to="/login" className="btn-ghost mt-6 inline-flex" data-testid="forgot-to-login">
                                Retour à la connexion
                            </Link>
                        </div>
                    )}
                </div>
            </div>
        </div>
    );
}
