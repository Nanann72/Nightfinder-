import { useState } from "react";
import { useNavigate } from "react-router-dom";
import { api } from "@/lib/api";
import { useAuth } from "@/lib/auth";
import { ShieldCheck, Camera, FileText, Sparkles } from "lucide-react";

export default function Verification() {
    const { user, refreshUser } = useAuth();
    const nav = useNavigate();
    const [state, setState] = useState("idle"); // idle | starting | mock-waiting | verified
    const [mode, setMode] = useState(null);
    const [err, setErr] = useState("");

    const start = async () => {
        setErr(""); setState("starting");
        try {
            const { data } = await api.post("/verification/start");
            setMode(data.mode);
            if (data.url) {
                window.location.href = data.url;
            } else {
                setState("mock-waiting");
            }
        } catch (e) {
            setErr("Impossible de démarrer la vérification."); setState("idle");
        }
    };

    const finishMock = async () => {
        setState("starting");
        try {
            await api.post("/verification/complete-mock");
            await refreshUser();
            setState("verified");
        } catch {
            setErr("Échec de la vérification."); setState("mock-waiting");
        }
    };

    if (user?.age_verified) {
        return (
            <div className="container-mx py-16">
                <div className="mx-auto max-w-md surface-card p-10 text-center" data-testid="already-verified">
                    <div className="mx-auto flex h-14 w-14 items-center justify-center rounded-2xl border border-green-500/30 bg-green-500/10">
                        <ShieldCheck className="text-green-400" size={24} />
                    </div>
                    <h1 className="mt-4 font-display text-2xl font-bold">Compte vérifié ✓</h1>
                    <p className="mt-2 text-sm text-white/60">Ton identité a bien été vérifiée. Tu peux maintenant accéder à tout le contenu premium.</p>
                    <button onClick={() => nav("/createurs")} className="btn-primary mt-6">Explorer les créatrices</button>
                </div>
            </div>
        );
    }

    return (
        <div className="container-mx py-14">
            <div className="mx-auto max-w-lg">
                <div className="surface-card p-8">
                    <div className="flex items-center gap-3">
                        <div className="flex h-12 w-12 items-center justify-center rounded-xl border border-magenta/30 bg-magenta/10">
                            <ShieldCheck className="text-magenta-200" size={22} />
                        </div>
                        <div>
                            <div className="overline">Vérification d'âge</div>
                            <h1 className="font-display text-2xl font-bold">Confirmation de majorité</h1>
                        </div>
                    </div>
                    <p className="mt-4 text-sm leading-relaxed text-white/60">
                        Pour accéder au contenu mature, la réglementation nous oblige à vérifier que tu es majeur(e). Une vérification rapide par notre équipe est requise une seule fois.
                    </p>

                    <div className="mt-6 grid gap-3">
                        {[
                            { i: FileText, t: "Photo recto de ta pièce d'identité", d: "Carte d'identité, passeport ou permis" },
                            { i: FileText, t: "Photo verso du document", d: "L'arrière de ta pièce d'identité" },
                            { i: Camera,   t: "Selfie de vérification",           d: "Pour confirmer que c'est bien toi" },
                        ].map((s, i) => {
                            const Icon = s.i;
                            return (
                                <div key={i} className="flex items-start gap-3 rounded-xl border border-white/5 bg-white/[0.02] p-3">
                                    <div className="flex h-8 w-8 shrink-0 items-center justify-center rounded-lg border border-white/10 bg-surface text-magenta-200">
                                        <Icon size={16} />
                                    </div>
                                    <div>
                                        <div className="text-sm font-semibold">{i + 1}. {s.t}</div>
                                        <div className="text-xs text-white/50">{s.d}</div>
                                    </div>
                                </div>
                            );
                        })}
                    </div>

                    {err && <div className="mt-4 rounded-lg border border-red-500/30 bg-red-500/10 p-3 text-sm text-red-300" data-testid="verify-error">{err}</div>}

                    {state === "idle" && (
                        <button data-testid="start-verification" onClick={start} className="btn-primary mt-6 w-full justify-center">
                            <Sparkles size={16} /> Commencer la vérification
                        </button>
                    )}
                    {state === "starting" && (
                        <button disabled className="btn-primary mt-6 w-full justify-center opacity-60">Démarrage…</button>
                    )}
                    {state === "mock-waiting" && (
                        <div className="mt-6 space-y-3">
                            <div className="rounded-xl border border-amber-500/30 bg-amber-500/10 p-3 text-xs text-amber-200">
                                Mode démo — La vérification d'âge n'est pas activée sur cette clé. Clique ci-dessous pour simuler une vérification réussie.
                            </div>
                            <button data-testid="mock-complete" onClick={finishMock} className="btn-primary w-full justify-center">
                                Simuler la vérification réussie
                            </button>
                        </div>
                    )}

                    <p className="mt-6 text-[11px] tracking-wide text-white/30">
                        me&you ne conserve aucune donnée personnelle · Chiffrement bout en bout
                    </p>
                </div>
            </div>
        </div>
    );
}
