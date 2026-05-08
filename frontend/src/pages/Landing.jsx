import { useEffect, useState } from "react";
import { Link } from "react-router-dom";
import { useTranslation } from "react-i18next";
import { api } from "@/lib/api";
import CreatorCard from "@/components/CreatorCard";
import NewsletterPopup from "@/components/NewsletterPopup";
import {
    ChevronRight, Sparkles, Wallet, ShieldCheck, Flame, Eye, Coins,
    MessageCircle, BarChart3, Lock, Zap, Heart, Quote, Star, Users,
    ArrowRight, Radio, Globe2
} from "lucide-react";
import { avatarUrl, onAvatarError } from "@/lib/avatars";

const CATEGORY_GROUPS = [
    { key: "mode_beaute", title: "Mode & Beauté", desc: "Looks, lingerie élégante, beauté", emoji: "👗", gradient: "from-pink-500/20 via-magenta/10 to-transparent", border: "border-pink-500/30" },
    { key: "sport", title: "Sport & Fitness", desc: "Yoga, danse, pole, pilates", emoji: "💪", gradient: "from-emerald-500/20 via-teal-500/10 to-transparent", border: "border-emerald-500/30" },
    { key: "art", title: "Art & Culture", desc: "Photo, musique, cosplay, gaming", emoji: "🎨", gradient: "from-violet-500/25 via-indigo-500/10 to-transparent", border: "border-violet-500/30" },
    { key: "wellness", title: "Lifestyle & Bien-être", desc: "Voyage, cuisine, méditation", emoji: "🌿", gradient: "from-amber-500/20 via-orange-500/10 to-transparent", border: "border-amber-500/30" },
    { key: "glamour", title: "Glamour & Premium", desc: "Glamour, boudoir artistique", emoji: "✨", gradient: "from-magenta/30 via-magenta/15 to-transparent", border: "border-magenta/40" },
    { key: "life", title: "Vie & Authenticité", desc: "Vlog, coulisses, daily life", emoji: "🎬", gradient: "from-sky-500/20 via-blue-500/10 to-transparent", border: "border-sky-500/30" },
];

const FEATURES = [
    { n: "01", icon: Wallet,        title: "Économie en coins", desc: "1 coin = 0,10 €. Achat, tip, déblocage et abonnements 100 % transparents." },
    { n: "02", icon: MessageCircle, title: "Messages privés",   desc: "Chat direct avec vos créatrices, photos exclusives et notes vocales." },
    { n: "03", icon: Radio,         title: "Live streaming",    desc: "Sessions en direct avec tips temps réel et modération communautaire." },
    { n: "04", icon: Lock,          title: "Contenu débloquable", desc: "Photos, vidéos et albums protégés par paywall granulaire." },
    { n: "05", icon: BarChart3,     title: "Analytics créatrice", desc: "Tableau de bord, conversion par poste, top supporters et payouts SEPA." },
    { n: "06", icon: ShieldCheck,   title: "Modération IA + humaine", desc: "Vérification d'identité KYC et système anti-abus 24/7." },
];

const PRESS = ["LE FIGARO", "KONBINI", "TRACE", "RADIO FG", "MADAME", "BFM"];

const TESTIMONIALS = [
    { name: "Lyse · @lyseprss", quote: "J'ai migré depuis MYM en 1 semaine, et mes revenus ont doublé en 2 mois grâce aux packs longue durée.", role: "Créatrice fitness · 12k abonné·e·s" },
    { name: "Camille · @cam_couture", quote: "L'interface est propre, les paiements arrivent en 24h, et le support répond en 1 heure max.", role: "Créatrice mode · 8k abonné·e·s" },
    { name: "Lou · @loumusic", quote: "Le live streaming change tout : je gagne plus en 1h de live qu'en 1 semaine de posts.", role: "Créatrice musique · 5k abonné·e·s" },
];

export default function Landing() {
    const { t } = useTranslation();
    const [creators, setCreators] = useState([]);
    const [openFaq, setOpenFaq] = useState(0);
    const [config, setConfig] = useState(null);

    useEffect(() => {
        api.get("/creators", { params: { limit: 8, trending: true } }).then(r => setCreators(r.data)).catch(() => {});
        api.get("/site-config").then(r => setConfig(r.data)).catch(() => {});
    }, []);

    const fallbackFaq = [
        { q: t("landing.faq.q1"), a: t("landing.faq.a1") },
        { q: t("landing.faq.q2"), a: t("landing.faq.a2") },
        { q: t("landing.faq.q3"), a: t("landing.faq.a3") },
        { q: t("landing.faq.q4"), a: t("landing.faq.a4") },
        { q: t("landing.faq.q5"), a: t("landing.faq.a5") },
    ];
    const isFrench = (typeof window !== "undefined" && (localStorage.getItem("meandyou_lang") || "fr").startsWith("fr"));
    const faq = (isFrench && config?.faq?.length) ? config.faq : fallbackFaq;

    return (
        <div className="relative z-10">
            {/* HERO ----------------------------------------------------- */}
            <section data-testid="hero-section" className="relative overflow-hidden pt-14 pb-20 sm:pt-20 sm:pb-28">
                <div className="container-mx grid items-center gap-12 lg:grid-cols-12 lg:gap-16">
                    <div className="lg:col-span-7 animate-fadeUp">
                        <span className="inline-flex items-center gap-2 rounded-full border border-white/[0.08] bg-white/[0.02] px-3 py-1 text-[11px] font-semibold uppercase tracking-[0.18em] text-white/55">
                            <span className="h-1.5 w-1.5 animate-pulse rounded-full bg-magenta" />
                            Le fan club premium français
                        </span>
                        <h1 className="mt-6 font-display text-[3.5rem] font-bold leading-[0.95] tracking-[-0.045em] sm:text-7xl lg:text-[7.5rem]">
                            Connecte-toi à<br/>
                            <span className="text-white/40">tes créatrices.</span>
                        </h1>
                        <p className="mt-7 max-w-xl text-lg leading-[1.5] text-white/55 sm:text-xl">
                            Une plateforme pensée pour la performance et l'intimité.
                            Abonne-toi, tip, débloque, discute en privé.
                        </p>

                        {/* 2 CTAs distincts — Apple-style */}
                        <div className="mt-10 flex flex-col gap-3 sm:flex-row">
                            <Link
                                data-testid="hero-cta-fan"
                                to="/register"
                                className="group inline-flex items-center justify-center gap-2 rounded-full bg-white px-7 py-4 text-[15px] font-semibold text-black transition-all hover:bg-white/90 active:scale-[0.97]"
                            >
                                Rejoindre comme fan
                                <ArrowRight size={15} className="transition-transform group-hover:translate-x-1" />
                            </Link>
                            <Link
                                data-testid="hero-cta-creator"
                                to="/register?creator=1"
                                className="group inline-flex items-center justify-center gap-2 rounded-full border border-white/[0.12] bg-transparent px-7 py-4 text-[15px] font-semibold text-white transition-all hover:bg-white/[0.06] active:scale-[0.97]"
                            >
                                Devenir créatrice·eur
                                <ArrowRight size={15} className="transition-transform group-hover:translate-x-1" />
                            </Link>
                        </div>

                        <div className="mt-10 flex flex-wrap items-center gap-x-6 gap-y-2.5 text-xs text-white/35">
                            <span className="flex items-center gap-1.5"><ShieldCheck size={13} /> Identité KYC vérifiée</span>
                            <span className="flex items-center gap-1.5"><Wallet size={13} /> Paiements Stripe</span>
                            <span className="flex items-center gap-1.5"><Eye size={13} /> 100% confidentiel</span>
                        </div>
                    </div>

                    {/* Right mosaic */}
                    <div className="lg:col-span-5">
                        <div className="relative grid grid-cols-2 gap-3">
                            {creators.slice(0, 4).map((c, i) => (
                                <div key={c.creator_id}
                                     className={`relative overflow-hidden rounded-3xl border border-white/10 ${i === 0 || i === 3 ? "h-72" : "h-52"} ${i === 1 ? "translate-y-6" : ""} ${i === 2 ? "-translate-y-6" : ""} animate-fadeUp shadow-[0_8px_30px_rgba(0,0,0,0.4)]`}
                                     style={{ animationDelay: `${i * 120}ms` }}>
                    <img src={avatarUrl(c)} alt={c.display_name} onError={onAvatarError} className="h-full w-full object-cover transition-transform duration-700 hover:scale-105" />
                                    <div className="absolute inset-0 bg-gradient-to-t from-black/85 via-black/15 to-transparent" />
                                    <div className="absolute bottom-4 left-4 right-4">
                                        <div className="text-[11px] text-white/75 font-mono">@{c.handle}</div>
                                        <div className="font-display font-bold text-lg leading-tight">{c.display_name}</div>
                                    </div>
                                    <div className="absolute top-3 right-3 rounded-full bg-black/65 px-2.5 py-1 text-[11px] font-mono text-magenta-200 backdrop-blur-md border border-white/10">
                                        {c.subscription_price?.toFixed(0)}€
                                    </div>
                                </div>
                            ))}
                            <div className="pointer-events-none absolute -inset-10 -z-10 rounded-[40px] bg-magenta/10 blur-3xl" />
                        </div>
                    </div>
                </div>
            </section>

            {/* PRESS STRIP ---------------------------------------------- */}
            <section data-testid="press-strip" className="border-y border-white/[0.05] bg-white/[0.015] py-7">
                <div className="container-mx flex flex-wrap items-center justify-center gap-x-8 gap-y-4 sm:gap-x-12">
                    <span className="text-[10px] uppercase tracking-[0.3em] text-white/35">Vue dans</span>
                    {PRESS.map(p => (
                        <span key={p} className="font-display text-sm font-bold uppercase tracking-[0.18em] text-white/40 transition-colors hover:text-white/70">
                            {p}
                        </span>
                    ))}
                </div>
            </section>

            {/* TRENDING CREATORS --------------------------------------- */}
            <section data-testid="trending-section" className="container-mx py-20">
                <div className="mb-8 flex items-end justify-between">
                    <div>
                        <div className="overline flex items-center gap-2"><Flame size={14} className="text-magenta-300" /> Tendances</div>
                        <h2 className="mt-2 font-display text-3xl font-bold sm:text-4xl">Créatrices iconiques</h2>
                        <p className="mt-2 text-sm text-white/55">Les profils qui cartonnent en ce moment.</p>
                    </div>
                    <Link to="/createurs" data-testid="trending-see-all"
                          className="hidden items-center gap-1 text-sm text-magenta-200 hover:text-white sm:flex">
                        Voir tout <ChevronRight size={16} />
                    </Link>
                </div>
                <div className="grid grid-cols-2 gap-4 sm:grid-cols-3 lg:grid-cols-4">
                    {creators.slice(0, 8).map((c, i) => (
                        <CreatorCard key={c.creator_id} creator={c} testIdSuffix={`-trending-${i}`} />
                    ))}
                </div>
            </section>

            {/* CATEGORIES ---------------------------------------------- */}
            <section className="container-mx py-12" data-testid="explore-categories-section">
                <div className="mb-8">
                    <div className="overline flex items-center gap-2"><Sparkles size={14} className="text-magenta-300" /> Explorer par catégorie</div>
                    <h2 className="mt-2 font-display text-3xl font-bold sm:text-4xl">Trouve ta vibe</h2>
                </div>
                <div className="grid grid-cols-2 gap-3 sm:gap-4 md:grid-cols-3">
                    {CATEGORY_GROUPS.map((g, i) => (
                        <Link
                            key={g.key}
                            to={`/createurs?group=${g.key}`}
                            data-testid={`category-card-${g.key}`}
                            className={`group relative overflow-hidden rounded-2xl border ${g.border} bg-gradient-to-br ${g.gradient} p-5 transition-all hover:scale-[1.02] hover:border-white/40 active:scale-[0.99]`}
                            style={{ animationDelay: `${i * 60}ms` }}
                        >
                            <div className="absolute right-3 top-3 text-3xl opacity-50 transition-all group-hover:scale-110 group-hover:opacity-90 sm:text-4xl" aria-hidden="true">
                                {g.emoji}
                            </div>
                            <div className="relative pr-12">
                                <h3 className="font-display text-base font-bold sm:text-lg">{g.title}</h3>
                                <p className="mt-1 text-xs leading-relaxed text-white/60">{g.desc}</p>
                                <div className="mt-4 inline-flex items-center gap-1 text-xs text-magenta-200 transition-transform group-hover:translate-x-1">
                                    Découvrir <ChevronRight size={12} />
                                </div>
                            </div>
                        </Link>
                    ))}
                </div>
            </section>

            {/* FEATURES 01-06 ------------------------------------------- */}
            <section data-testid="features-section" className="container-mx py-20">
                <div className="mb-12 max-w-2xl">
                    <div className="overline flex items-center gap-2"><Zap size={14} className="text-magenta-300" /> Tout ce qu'il te faut</div>
                    <h2 className="mt-2 font-display text-3xl font-bold sm:text-5xl">Une plateforme premium, sans compromis.</h2>
                    <p className="mt-3 text-sm text-white/60">De la première story au premier payout, tout est pensé pour la performance et la sécurité.</p>
                </div>
                <div className="grid gap-4 md:grid-cols-2 lg:grid-cols-3">
                    {FEATURES.map((f) => {
                        const Icon = f.icon;
                        return (
                            <div key={f.n} data-testid={`feature-${f.n}`}
                                 className="group rounded-3xl border border-white/[0.06] bg-[var(--bg-surface)] p-6 transition-all hover:-translate-y-1 hover:border-magenta/30">
                                <div className="flex items-center justify-between">
                                    <span className="font-mono text-3xl font-bold text-magenta/35 transition-colors group-hover:text-magenta-200">{f.n}</span>
                                    <span className="flex h-10 w-10 items-center justify-center rounded-2xl border border-magenta/20 bg-magenta/5 text-magenta-200 transition-all group-hover:border-magenta/50 group-hover:bg-magenta/15">
                                        <Icon size={18} />
                                    </span>
                                </div>
                                <h3 className="mt-5 font-display text-xl font-bold">{f.title}</h3>
                                <p className="mt-2 text-sm leading-relaxed text-white/55">{f.desc}</p>
                            </div>
                        );
                    })}
                </div>
            </section>

            {/* STATS / TRUST BANNER -------------------------------------- */}
            <section className="container-mx py-12">
                <div className="grid gap-3 rounded-3xl border border-white/[0.06] bg-[var(--bg-surface)] p-8 sm:grid-cols-4 sm:p-10">
                    {[
                        { n: "80/20", label: "Commission créatrice", icon: Coins },
                        { n: "24h",   label: "Délai de payout SEPA", icon: Wallet },
                        { n: "100%",  label: "Identités vérifiées", icon: ShieldCheck },
                        { n: "FR/EU", label: "Hébergement & RGPD", icon: Globe2 },
                    ].map((s) => {
                        const Icon = s.icon;
                        return (
                            <div key={s.label} className="text-center">
                                <Icon size={18} className="mx-auto text-magenta-300" />
                                <div className="mt-3 font-display text-3xl font-bold text-white">{s.n}</div>
                                <div className="mt-1 text-[11px] uppercase tracking-widest text-white/45">{s.label}</div>
                            </div>
                        );
                    })}
                </div>
            </section>

            {/* TESTIMONIALS ---------------------------------------------- */}
            <section data-testid="testimonials-section" className="container-mx py-20">
                <div className="mb-10 max-w-2xl">
                    <div className="flex items-center gap-2">
                        <div className="flex">
                            {[0,1,2,3,4].map(i => <Star key={i} size={14} className="fill-amber-400 text-amber-400" />)}
                        </div>
                        <span className="text-xs text-white/55">4,8 / 5 · 127 avis vérifiés</span>
                    </div>
                    <h2 className="mt-3 font-display text-3xl font-bold sm:text-4xl">Elles parlent de me&you</h2>
                </div>
                <div className="grid gap-4 md:grid-cols-3">
                    {TESTIMONIALS.map((tt, i) => (
                        <figure key={i} data-testid={`testimonial-${i}`}
                                className="rounded-3xl border border-white/[0.06] bg-[var(--bg-surface)] p-6">
                            <Quote size={18} className="text-magenta/40" />
                            <blockquote className="mt-3 text-sm leading-relaxed text-white/85">
                                {tt.quote}
                            </blockquote>
                            <figcaption className="mt-5 border-t border-white/5 pt-4">
                                <div className="text-sm font-semibold text-white">{tt.name}</div>
                                <div className="text-[11px] text-white/45">{tt.role}</div>
                            </figcaption>
                        </figure>
                    ))}
                </div>
            </section>

            {/* CREATOR CTA BANNER ---------------------------------------- */}
            <section className="container-mx py-20">
                <div className="relative overflow-hidden rounded-[2rem] border border-magenta/30 bg-gradient-to-br from-magenta/15 via-[var(--bg-surface)] to-[var(--bg-surface)] p-10 sm:p-16">
                    <div className="grid-noise absolute inset-0 opacity-40" />
                    <div className="relative max-w-2xl">
                        <div className="overline">Pour les créatrices·eurs</div>
                        <h2 className="mt-3 font-display text-3xl font-bold sm:text-5xl">
                            Reprends le contrôle de ton{" "}
                            <span className="bg-gradient-to-r from-magenta to-pink-300 bg-clip-text text-transparent">audience</span> et de tes <span className="bg-gradient-to-r from-magenta to-pink-300 bg-clip-text text-transparent">revenus</span>.
                        </h2>
                        <p className="mt-5 text-white/60">
                            Onboarding en 10 minutes, payout SEPA en 24h, support humain en français. Aucun frais d'inscription.
                        </p>
                        <div className="mt-8 flex flex-wrap gap-3">
                            <Link to="/devenir-createur" data-testid="become-creator-cta" className="btn-primary">
                                <Sparkles size={14} /> Commencer maintenant <ChevronRight size={14} />
                            </Link>
                            <Link to="/createurs" className="btn-ghost">Voir des créatrices</Link>
                        </div>
                        <div className="mt-7 flex flex-wrap items-center gap-x-5 gap-y-2 text-[11px] text-white/45">
                            <span className="flex items-center gap-1.5"><Users size={11} /> +5 000 créateur·rice·s actif·ve·s</span>
                            <span className="flex items-center gap-1.5"><Coins size={11} /> 200 k€ payés ce mois</span>
                        </div>
                    </div>
                </div>
            </section>

            {/* FAQ ------------------------------------------------------ */}
            <section data-testid="faq-section" className="container-mx py-16">
                <div className="grid gap-10 lg:grid-cols-12">
                    <div className="lg:col-span-4">
                        <div className="overline">{t("landing.faq.eyebrow")}</div>
                        <h2 className="mt-2 font-display text-3xl font-bold sm:text-4xl">{t("landing.faq.title")}</h2>
                        <p className="mt-3 text-sm text-white/55">Toutes les réponses aux questions courantes.</p>
                        <a href="mailto:contact@meandyou.fans" className="mt-5 inline-flex items-center gap-1 text-sm text-magenta-200 hover:text-white">
                            <MessageCircle size={13} /> Une autre question ? Contacte-nous
                        </a>
                    </div>
                    <div className="lg:col-span-8">
                        <div className="divide-y divide-white/[0.05] rounded-3xl border border-white/[0.06] bg-[var(--bg-surface)]">
                            {faq.map((f, i) => {
                                const open = openFaq === i;
                                return (
                                    <div key={i}>
                                        <button
                                            data-testid={`faq-toggle-${i}`}
                                            onClick={() => setOpenFaq(open ? -1 : i)}
                                            className="flex w-full items-center justify-between p-5 text-left transition-colors hover:bg-white/[0.02] sm:p-6"
                                        >
                                            <span className="font-display text-base font-semibold pr-3 sm:text-lg">{f.q}</span>
                                            <ChevronRight size={18} className={`shrink-0 transition-transform ${open ? "rotate-90 text-magenta" : "text-white/40"}`} />
                                        </button>
                                        {open && (
                                            <div className="px-5 pb-5 text-sm leading-relaxed text-white/65 sm:px-6 sm:pb-6">
                                                {f.a}
                                            </div>
                                        )}
                                    </div>
                                );
                            })}
                        </div>
                    </div>
                </div>
            </section>

            {/* FINAL CTA ------------------------------------------------ */}
            <section className="container-mx pb-20">
                <div className="rounded-[2rem] border border-white/[0.06] bg-gradient-to-br from-[var(--bg-surface)] to-black p-10 text-center sm:p-16">
                    <Sparkles size={28} className="mx-auto text-magenta-300" />
                    <h3 className="mt-4 font-display text-3xl font-bold sm:text-5xl">{t("landing.final.title")}</h3>
                    <p className="mx-auto mt-4 max-w-xl text-white/60">
                        {t("landing.final.desc")}
                    </p>
                    <div className="mt-8 flex flex-wrap justify-center gap-3">
                        <Link to="/register" data-testid="final-cta" className="btn-primary">
                            <Heart size={14} /> Rejoindre comme fan
                        </Link>
                        <Link to="/devenir-createur" data-testid="final-cta-creator" className="btn-ghost">
                            <Sparkles size={14} /> Devenir créatrice·eur
                        </Link>
                    </div>
                </div>
            </section>
            <NewsletterPopup />
        </div>
    );
}
