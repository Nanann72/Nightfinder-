import { useEffect, useState } from "react";
import { api } from "@/lib/api";
import { useAuth } from "@/lib/auth";
import { Copy, CheckCircle2, Gift, Users, Coins, Share2 } from "lucide-react";

export default function Referral() {
    const { user } = useAuth();
    const [data, setData] = useState(null);
    const [copied, setCopied] = useState(false);

    useEffect(() => {
        api.get("/referral/me").then(r => setData(r.data)).catch(() => {});
    }, []);

    if (!user) return <div className="container-mx py-16 text-white/60" data-testid="referral-nologin">Connecte-toi pour accéder à ton parrainage.</div>;
    if (!data) return <div className="container-mx py-16 text-white/40" data-testid="referral-loading">Chargement…</div>;

    const base = window.location.origin;
    const link = `${base}/register?ref=${data.code}`;

    const copy = async (txt) => {
        try {
            await navigator.clipboard.writeText(txt);
            setCopied(true);
            setTimeout(() => setCopied(false), 2000);
        } catch { /* noop */ }
    };

    const share = async () => {
        const text = `Rejoins-moi sur me&you et reçois ${data.bonus_per_referral} coins gratuits ! 🎁`;
        if (navigator.share) {
            try { await navigator.share({ title: "me&you", text, url: link }); } catch { /* noop */ }
        } else {
            copy(link);
        }
    };

    return (
        <div className="container-mx py-10 sm:py-16" data-testid="referral-page">
            <div className="overline">Parrainage</div>
            <h1 className="mt-2 font-display text-3xl font-bold sm:text-4xl">
                Gagne <span className="gradient-text">{data.bonus_per_referral} coins</span> par filleul·e
            </h1>
            <p className="mt-3 max-w-2xl text-white/60">
                Partage ton lien unique. À chaque fois qu'un·e ami·e s'inscrit et recharge son wallet pour la 1ʳᵉ fois, vous recevez tous les deux <strong className="text-white">{data.bonus_per_referral} coins</strong> (≈ {(data.bonus_per_referral * 0.1).toFixed(2)} €). Sans limite.
            </p>

            <div className="mt-8 grid gap-4 sm:grid-cols-3">
                <StatCard icon={Gift} label="Inscrits avec ton lien" value={data.signed_up} testId="stat-signed-up" />
                <StatCard icon={CheckCircle2} label="Rechargés (bonus validé)" value={data.completed} testId="stat-completed" />
                <StatCard icon={Coins} label="Coins gagnés" value={data.coins_earned} accent testId="stat-earned" />
            </div>

            <div className="mt-8 surface-card border-magenta/30" data-testid="referral-code-card">
                <div className="overline flex items-center gap-2"><Users size={12} /> Ton code</div>
                <div className="mt-3 flex flex-wrap items-center gap-3">
                    <div className="rounded-xl border border-magenta/40 bg-magenta/10 px-5 py-3 font-mono text-2xl font-bold tracking-widest text-magenta-200 sm:text-3xl" data-testid="referral-code">
                        {data.code}
                    </div>
                    <button onClick={() => copy(data.code)} data-testid="copy-code" className="btn-ghost">
                        <Copy size={14} /> {copied ? "Copié ✓" : "Copier le code"}
                    </button>
                </div>

                <div className="mt-6">
                    <div className="overline text-[10px]">Ton lien de parrainage</div>
                    <div className="mt-2 flex flex-col gap-2 sm:flex-row">
                        <input
                            readOnly
                            value={link}
                            data-testid="referral-link"
                            onClick={(e) => e.target.select()}
                            className="input-base flex-1 font-mono text-xs"
                        />
                        <button onClick={() => copy(link)} className="btn-outline-magenta" data-testid="copy-link">
                            <Copy size={14} /> Copier
                        </button>
                        <button onClick={share} className="btn-primary" data-testid="share-link">
                            <Share2 size={14} /> Partager
                        </button>
                    </div>
                </div>
            </div>

            <div className="mt-6 text-sm text-white/50">
                <strong className="text-white/80">Comment ça marche ?</strong>
                <ul className="mt-2 space-y-1.5">
                    <li>1. Tu partages ton lien ou ton code à un·e ami·e.</li>
                    <li>2. Elle/il s'inscrit et effectue sa 1ʳᵉ recharge (n'importe quel pack).</li>
                    <li>3. Vous recevez tous les deux {data.bonus_per_referral} coins instantanément 🎁</li>
                </ul>
            </div>
        </div>
    );
}

function StatCard({ icon: Icon, label, value, accent, testId }) {
    return (
        <div className={`surface-card ${accent ? "border-magenta/30" : ""}`} data-testid={testId}>
            <div className={`inline-flex h-10 w-10 items-center justify-center rounded-xl border ${accent ? "border-magenta/40 bg-magenta/10 text-magenta-200" : "border-white/10 bg-white/[0.03] text-white/60"}`}>
                <Icon size={18} />
            </div>
            <div className="mt-4 font-mono text-3xl font-bold">{value}</div>
            <div className="mt-1 text-xs uppercase tracking-widest text-white/40">{label}</div>
        </div>
    );
}
