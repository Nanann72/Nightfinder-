import { useState } from "react";
import { Link, useNavigate } from "react-router-dom";
import { Sparkles, ChevronRight, X, Check, Crown } from "lucide-react";
import { useAuth, formatApiError } from "@/lib/auth";
import { api } from "@/lib/api";

const PERKS = [
    { t: "80 % de reversement", d: "Nous gardons seulement 20 % pour couvrir les frais de plateforme." },
    { t: "Paiements quotidiens", d: "Reçois tes gains en quelques secondes via Stripe." },
    { t: "Outils intégrés", d: "Dashboard, messagerie privée, pourboires, déverrouillage à l'unité." },
    { t: "Confidentialité totale", d: "Ton identité reste privée. Tu choisis ce que tu partages." },
];

export default function BecomeCreator() {
    const { user, refreshUser } = useAuth();
    const nav = useNavigate();
    const [confirmOpen, setConfirmOpen] = useState(false);

    const isCreator = user?.role === "creator";

    const handleCta = () => {
        if (!user) {
            // Not logged in — send to register with ?creator=1
            nav("/register?creator=1");
            return;
        }
        if (isCreator) {
            nav("/dashboard");
            return;
        }
        // Logged in as fan → show confirmation modal
        setConfirmOpen(true);
    };

    const ctaLabel = !user
        ? "Créer mon compte créatrice"
        : isCreator
            ? "Aller sur mon dashboard"
            : "Devenir créatrice";

    return (
        <div className="container-mx py-10 sm:py-16">
            <div className="grid gap-10 lg:grid-cols-2">
                <div>
                    <div className="overline">Créatrice</div>
                    <h1 className="mt-3 font-display text-4xl font-bold sm:text-5xl">
                        Transforme ta communauté en <span className="gradient-text">revenus récurrents</span>.
                    </h1>
                    <p className="mt-5 text-white/60">
                        Publie ton contenu exclusif, discute avec tes fans en privé et reçois des pourboires. me&you s'occupe de la tech et des paiements — tu te concentres sur ce que tu aimes.
                    </p>
                    {user && !isCreator && (
                        <div className="mt-6 flex items-center gap-2 rounded-xl border border-magenta/20 bg-magenta/5 p-3 text-sm text-white/70" data-testid="become-creator-logged-note">
                            <Check size={14} className="text-magenta-200 shrink-0" />
                            <span>Tu es connecté·e en tant que <strong className="text-white">{user.name}</strong> — pas besoin de créer un nouveau compte.</span>
                        </div>
                    )}
                    <div className="mt-8 flex flex-wrap gap-3">
                        <button onClick={handleCta} data-testid="become-creator-cta" className="btn-primary">
                            {isCreator ? <Crown size={16} /> : <Sparkles size={16} />} {ctaLabel}
                        </button>
                        <Link to="/createurs" className="btn-ghost">Voir d'autres créatrices</Link>
                    </div>
                </div>
                <div className="grid gap-4 sm:grid-cols-2">
                    {PERKS.map((p, i) => (
                        <div key={i} className="surface-card">
                            <ChevronRight size={16} className="text-magenta-400" />
                            <div className="mt-3 font-display text-lg font-semibold">{p.t}</div>
                            <div className="mt-2 text-sm text-white/60">{p.d}</div>
                        </div>
                    ))}
                </div>
            </div>

            {confirmOpen && (
                <ConfirmBecomeCreatorModal
                    user={user}
                    onClose={async (upgraded) => {
                        setConfirmOpen(false);
                        if (upgraded) {
                            await refreshUser();
                            nav("/dashboard");
                        }
                    }}
                />
            )}
        </div>
    );
}

function ConfirmBecomeCreatorModal({ user, onClose }) {
    const [loading, setLoading] = useState(false);
    const [err, setErr] = useState("");
    const [accepted, setAccepted] = useState(false);

    const confirm = async () => {
        if (!accepted) {
            setErr("Tu dois accepter les Conditions d'utilisation et la Politique d'utilisation acceptable.");
            return;
        }
        setLoading(true); setErr("");
        try {
            await api.post("/creators/me/become", { terms_accepted: true });
            onClose(true);
        } catch (e) {
            setErr(formatApiError(e.response?.data?.detail) || e.message);
            setLoading(false);
        }
    };

    return (
        <div className="fixed inset-0 z-[60] flex items-center justify-center bg-black/80 backdrop-blur p-4 overflow-y-auto" data-testid="become-creator-modal">
            <div className="w-full max-w-md my-8 rounded-2xl border border-magenta/30 bg-surface p-6">
                <div className="flex items-start justify-between">
                    <div className="flex items-center gap-2">
                        <div className="flex h-9 w-9 items-center justify-center rounded-xl bg-magenta/15 text-magenta-200">
                            <Crown size={18} />
                        </div>
                        <div>
                            <h3 className="font-display text-lg font-bold">Devenir créatrice ?</h3>
                            <p className="text-xs text-white/50">Confirmation rapide</p>
                        </div>
                    </div>
                    <button onClick={() => onClose(false)} data-testid="become-creator-close"
                            className="rounded-full p-1 text-white/50 hover:bg-white/5 hover:text-white">
                        <X size={16} />
                    </button>
                </div>

                <div className="mt-5 space-y-3 text-sm text-white/70">
                    <p>
                        Tu es connecté·e en tant que <strong className="text-white">{user?.name}</strong> (<span className="text-white/50">{user?.email}</span>).
                    </p>
                    <p>
                        En confirmant, ton compte sera transformé en <strong className="text-white">compte créatrice</strong>. Tu auras accès à :
                    </p>
                    <ul className="ml-1 space-y-1.5">
                        <li className="flex items-start gap-2"><Check size={14} className="mt-0.5 text-magenta-200 shrink-0" /> Dashboard et gestion de ton profil public</li>
                        <li className="flex items-start gap-2"><Check size={14} className="mt-0.5 text-magenta-200 shrink-0" /> Publication de contenu + stories 24 h</li>
                        <li className="flex items-start gap-2"><Check size={14} className="mt-0.5 text-magenta-200 shrink-0" /> Réception des pourboires et abonnements (80 %)</li>
                        <li className="flex items-start gap-2"><Check size={14} className="mt-0.5 text-magenta-200 shrink-0" /> IBAN / SEPA pour tes retraits</li>
                    </ul>
                </div>

                <label className="mt-5 flex items-start gap-3 rounded-xl border border-magenta/20 bg-magenta/5 p-3 text-sm text-white/80 cursor-pointer hover:bg-magenta/10 transition-colors" data-testid="become-creator-terms-label">
                    <input
                        type="checkbox"
                        checked={accepted}
                        onChange={(e) => { setAccepted(e.target.checked); setErr(""); }}
                        className="mt-1 h-4 w-4 shrink-0 cursor-pointer accent-magenta"
                        data-testid="become-creator-terms-checkbox"
                    />
                    <span>
                        J'ai lu et j'accepte les{" "}
                        <Link to="/legal/terms" target="_blank" rel="noopener noreferrer" className="text-magenta-200 underline hover:text-white" data-testid="become-creator-terms-link">
                            Conditions d'utilisation
                        </Link>
                        {" "}et la{" "}
                        <Link to="/legal/acceptable-use" target="_blank" rel="noopener noreferrer" className="text-magenta-200 underline hover:text-white" data-testid="become-creator-aup-link">
                            Politique d'utilisation acceptable
                        </Link>
                        . Je confirme que mon contenu ne contiendra pas de contenu sexuellement explicite, de pornographie ni de nudité explicite.
                    </span>
                </label>

                {err && <div className="mt-4 rounded-lg border border-red-500/30 bg-red-500/10 p-3 text-sm text-red-300" data-testid="become-creator-error">{err}</div>}

                <div className="mt-6 flex gap-2">
                    <button onClick={() => onClose(false)} className="btn-ghost flex-1 justify-center" data-testid="become-creator-cancel">
                        Annuler
                    </button>
                    <button
                        onClick={confirm}
                        disabled={loading || !accepted}
                        className="btn-primary flex-1 justify-center disabled:opacity-40 disabled:cursor-not-allowed"
                        data-testid="become-creator-confirm"
                        title={!accepted ? "Accepte les conditions pour continuer" : ""}
                    >
                        {loading ? "Activation…" : "Oui, devenir créatrice"}
                    </button>
                </div>
            </div>
        </div>
    );
}
