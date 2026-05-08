import { useEffect, useState } from "react";
import { useParams, useNavigate, Link } from "react-router-dom";
import { useTranslation } from "react-i18next";
import { api } from "@/lib/api";
import { useAuth, formatApiError } from "@/lib/auth";
import PaywallContent from "@/components/PaywallContent";
import FidelityBadge from "@/components/FidelityBadge";
import { refreshWallet } from "@/components/WalletChip";
import {
    MessageCircle, Sparkles, ShieldCheck, Gift, X, Coins, Trophy, Tag, Package,
    Zap, CreditCard, ExternalLink, Radio, Heart, Image as ImageIcon, Info,
    ArrowLeft, Check, Star, Calendar
} from "lucide-react";
import { avatarUrl, onAvatarError, fallbackAvatarUrl } from "@/lib/avatars";

/**
 * Fanvue-style creator profile.
 * Layout (inside SmartShell):
 *   ┌─ Back nav
 *   ├─ Banner (3:1) full-width
 *   ├─ Avatar overlap + name/verified/handle
 *   ├─ Inline stats + bio + external link
 *   ├─ Subscribe + Tip + Message buttons row
 *   ├─ Sticky tabs: Posts · Médias · À propos · Live
 *   └─ Active tab content
 */
export default function CreatorProfile() {
    const { id } = useParams();
    const { t } = useTranslation();
    const nav = useNavigate();
    const { user } = useAuth();
    const [creator, setCreator] = useState(null);
    const [tipOpen, setTipOpen] = useState(false);
    const [tipCoins, setTipCoins] = useState(50);
    const [tipMessage, setTipMessage] = useState("");
    const [customOpen, setCustomOpen] = useState(false);
    const [bundleOpen, setBundleOpen] = useState(false);
    const [loading, setLoading] = useState(false);
    const [err, setErr] = useState("");
    const [wallet, setWallet] = useState(null);
    const [topTippers, setTopTippers] = useState([]);
    const [similar, setSimilar] = useState([]);
    const [bundles, setBundles] = useState([]);
    const [tab, setTab] = useState("posts");

    const load = async () => {
        try {
            const r = await api.get(`/creators/${id}`);
            setCreator(r.data);
            const handle = r.data?.handle;
            if (handle) {
                try { const tt = await api.get(`/creators/${handle}/top-tippers`); setTopTippers(tt.data.top || []); } catch {}
            }
            try { const s = await api.get(`/creators/${r.data.creator_id}/similar?limit=4`); setSimilar(s.data || []); } catch {}
            try { const b = await api.get(`/creators/${r.data.creator_id}/bundles`); setBundles(b.data.bundles || []); } catch {}
            if (user) { try { const w = await api.get("/wallet"); setWallet(w.data); } catch {} }
        } catch { nav("/createurs"); }
    };
    useEffect(() => { load(); }, [id, user]);  // eslint-disable-line

    if (!creator) {
        return <div className="container-mx py-24 text-center text-white/40" data-testid="creator-loading">Chargement…</div>;
    }

    const needsLogin = !user;
    const effectivePrice = creator.effective_price ?? creator.subscription_price;
    const priceCoins = Math.round((effectivePrice || 0) * 10);
    const basePriceCoins = Math.round((creator.subscription_price || 0) * 10);
    const activePromo = creator.active_promo;
    const isLive = creator.is_live || creator.live_session_id;

    const guardAndCall = async (fn) => {
        if (needsLogin) return nav("/login");
        if (!user.age_verified) return nav("/verification");
        return fn();
    };
    const handleInsufficient = (needed, balance) => {
        setErr(`Solde insuffisant (${balance}/${needed} coins). Recharge ton wallet pour continuer.`);
        setTimeout(() => nav("/wallet"), 1200);
    };

    const subscribe = () => guardAndCall(async () => {
        setErr(""); setLoading(true);
        try {
            await api.post("/payments/subscribe", { creator_id: creator.creator_id });
            refreshWallet(); await load();
        } catch (e) {
            const d = e.response?.data?.detail;
            if (d?.error === "insufficient_coins") handleInsufficient(d.needed, d.balance);
            else setErr(formatApiError(d) || e.message);
        } finally { setLoading(false); }
    });

    const sendTip = () => guardAndCall(async () => {
        setErr(""); setLoading(true);
        try {
            await api.post("/payments/tip", { creator_id: creator.creator_id, coins: Number(tipCoins), message: tipMessage });
            refreshWallet(); setTipOpen(false); setTipMessage("");
        } catch (e) {
            const d = e.response?.data?.detail;
            if (d?.error === "insufficient_coins") handleInsufficient(d.needed, d.balance);
            else setErr(formatApiError(d) || e.message);
        } finally { setLoading(false); }
    });

    const unlock = (content) => guardAndCall(async () => {
        setErr(""); setLoading(true);
        try {
            await api.post("/payments/unlock", { content_id: content.content_id });
            refreshWallet(); await load();
        } catch (e) {
            const d = e.response?.data?.detail;
            if (d?.error === "insufficient_coins") handleInsufficient(d.needed, d.balance);
            else setErr(formatApiError(d) || e.message);
        } finally { setLoading(false); }
    });

    const TABS = [
        { id: "posts", label: "Posts", icon: Sparkles, count: (creator.content || []).length },
        { id: "media", label: "Médias", icon: ImageIcon },
        { id: "about", label: "À propos", icon: Info },
        ...(isLive ? [{ id: "live", label: "Live", icon: Radio }] : []),
    ];

    return (
        <div className="mx-auto w-full max-w-[680px] pb-4" data-testid="creator-profile">
            {/* Back */}
            <button
                onClick={() => nav(-1)}
                data-testid="profile-back"
                className="my-2 inline-flex items-center gap-1.5 px-2 text-xs text-white/50 hover:text-white sm:my-3 sm:text-sm"
            >
                <ArrowLeft size={13} /> Retour
            </button>

            {/* Banner */}
            <div className="relative overflow-hidden rounded-2xl border border-white/[0.06] sm:rounded-3xl">
                <div className="aspect-[5/2] w-full sm:aspect-[3/1]">
                    <img
                        src={creator.cover_url || avatarUrl(creator)}
                        alt=""
                        onError={onAvatarError}
                        className="h-full w-full object-cover"
                    />
                    <div className="absolute inset-0 bg-gradient-to-b from-transparent via-transparent to-black/65" />
                </div>
                {isLive && (
                    <Link
                        to={`/live/${creator.live_session_id || creator.creator_id}`}
                        data-testid="profile-live-badge"
                        className="absolute top-2 left-2 inline-flex items-center gap-1 rounded-full bg-red-500/95 px-2.5 py-0.5 text-[10px] font-bold uppercase tracking-widest text-white shadow-lg sm:top-3 sm:left-3 sm:px-3 sm:py-1 sm:text-[11px]"
                    >
                        <span className="h-1.5 w-1.5 animate-pulse rounded-full bg-white" />
                        Live
                    </Link>
                )}
            </div>

            {/* Avatar overlap + identity */}
            <div className="relative px-3 sm:px-5">
                <div className="-mt-10 flex items-end gap-3 sm:-mt-16 sm:gap-4">
                    <div className="h-20 w-20 shrink-0 overflow-hidden rounded-2xl border-4 border-[var(--bg-base)] bg-[var(--bg-elevated)] sm:h-28 sm:w-28 sm:rounded-3xl">
                        <img src={avatarUrl(creator)} alt={creator.display_name} onError={onAvatarError} className="h-full w-full object-cover" />
                    </div>
                    {creator.is_subscribed && (
                        <div className="mb-2 inline-flex items-center gap-1 rounded-full border border-emerald-500/40 bg-emerald-500/15 px-2.5 py-0.5 text-[10px] font-bold text-emerald-300 sm:px-3 sm:py-1 sm:text-[11px]" data-testid="already-subscribed">
                            <Check size={11} /> {t("creator.already_subscribed") || "Abonné·e"}
                        </div>
                    )}
                </div>

                <div className="mt-2 sm:mt-3">
                    <div className="flex flex-wrap items-center gap-1.5 sm:gap-2">
                        <h1 className="font-display text-xl font-bold sm:text-3xl" data-testid="creator-name">
                            {creator.display_name}
                        </h1>
                        <span className="inline-flex items-center gap-1 rounded-full bg-magenta/15 px-2 py-0.5 text-[10px] font-bold uppercase tracking-widest text-magenta-200">
                            <ShieldCheck size={10} /> Vérifié·e
                        </span>
                    </div>
                    <div className="mt-0.5 text-xs text-white/45 sm:text-sm">@{creator.handle}</div>
                </div>

                {creator.bio && (
                    <p className="mt-3 max-w-prose text-sm leading-relaxed text-white/75 whitespace-pre-line">
                        {creator.bio}
                    </p>
                )}

                {creator.external_url && (
                    <a href={creator.external_url} target="_blank" rel="noopener noreferrer"
                       data-testid="creator-external-link"
                       className="mt-3 inline-flex items-center gap-1.5 text-xs text-magenta-200 hover:text-white transition-colors">
                        <ExternalLink size={11} />
                        {(() => { try { return new URL(creator.external_url).hostname.replace(/^www\./, ""); } catch { return "Lien externe"; } })()}
                    </a>
                )}

                {/* Inline stats */}
                <div className="mt-4 flex flex-wrap items-center gap-x-5 gap-y-1.5 text-sm">
                    <Stat n={creator.subscribers_count || 0} l="abonné·e·s" />
                    <Stat n={(creator.content || []).length} l="posts" />
                    {creator.likes_total != null && <Stat n={creator.likes_total} l="likes" />}
                </div>

                {/* Promo banner */}
                {activePromo && !creator.is_subscribed && (
                    <div className="mt-4 flex items-center gap-3 rounded-2xl border border-magenta/40 bg-gradient-to-r from-magenta/15 via-magenta/8 to-transparent p-3" data-testid="active-promo-banner">
                        <div className="flex h-9 w-9 shrink-0 items-center justify-center rounded-2xl bg-magenta/20 text-magenta-200">
                            <Tag size={15} />
                        </div>
                        <div className="flex-1 min-w-0">
                            <div className="text-sm font-bold text-white">-{activePromo.percent_off}% jusqu'au {new Date(activePromo.ends_at).toLocaleDateString("fr-FR")}</div>
                            {activePromo.label && <div className="truncate text-xs text-white/60">{activePromo.label}</div>}
                        </div>
                    </div>
                )}

                {err && <div className="mt-4 rounded-2xl border border-red-500/30 bg-red-500/10 p-3 text-sm text-red-300" data-testid="profile-error">{err}</div>}

                {/* Action row */}
                <div className="mt-5 space-y-2">
                    {creator.is_subscribed ? (
                        <button data-testid="manage-sub-btn" onClick={() => nav("/settings/subscriptions")}
                                className="btn-ghost w-full justify-center">
                            <Heart size={15} /> Gérer l'abonnement
                        </button>
                    ) : (
                        <>
                            <button
                                data-testid="subscribe-btn" onClick={subscribe} disabled={loading}
                                className="inline-flex w-full items-center justify-center gap-2 rounded-full bg-gradient-to-r from-magenta to-magenta-dark px-7 py-3.5 text-sm font-bold text-white shadow-lg shadow-magenta/30 transition-all hover:shadow-magenta/50 hover:scale-[1.01] disabled:opacity-50 disabled:cursor-not-allowed"
                            >
                                <Sparkles size={16} />
                                S'abonner pour {priceCoins} coins
                                {activePromo && (
                                    <span className="ml-1 text-[11px] font-semibold text-white/70 line-through">
                                        {basePriceCoins}
                                    </span>
                                )}
                                <span className="text-[11px] font-medium opacity-80">/ mois</span>
                            </button>

                            {bundles.length > 0 && (
                                <button
                                    type="button"
                                    onClick={() => setBundleOpen(true)}
                                    data-testid="bundle-open-btn"
                                    className="inline-flex w-full items-center justify-center gap-1.5 rounded-full border border-amber-500/30 bg-amber-500/5 px-4 py-2.5 text-xs font-semibold text-amber-200 hover:bg-amber-500/15 transition-all"
                                >
                                    <Package size={12} /> {t("creator.bundle_save") || "Économiser avec un pack longue durée"}
                                </button>
                            )}
                        </>
                    )}

                    <div className="grid grid-cols-3 gap-2">
                        <button data-testid="tip-open-btn" onClick={() => setTipOpen(true)}
                                className="flex items-center justify-center gap-1.5 rounded-full border border-white/10 bg-white/[0.03] px-4 py-2.5 text-xs font-semibold text-white/85 hover:border-magenta/40 hover:bg-magenta/8 hover:text-white transition-all">
                            <Gift size={13} /> Tip
                        </button>
                        <Link to={`/messages?creator=${creator.creator_id}`} data-testid="message-creator-btn"
                              className="flex items-center justify-center gap-1.5 rounded-full border border-white/10 bg-white/[0.03] px-4 py-2.5 text-xs font-semibold text-white/85 hover:border-magenta/40 hover:bg-magenta/8 hover:text-white transition-all">
                            <MessageCircle size={13} /> Message
                        </Link>
                        {user && user.user_id !== creator.creator_id ? (
                            <button data-testid="custom-request-btn" onClick={() => setCustomOpen(true)}
                                    className="flex items-center justify-center gap-1.5 rounded-full border border-white/10 bg-white/[0.03] px-4 py-2.5 text-xs font-semibold text-white/85 hover:border-magenta/40 hover:bg-magenta/8 hover:text-white transition-all">
                                <Package size={13} /> Commande
                            </button>
                        ) : (
                            <button disabled className="flex items-center justify-center gap-1.5 rounded-full border border-white/5 bg-white/[0.02] px-4 py-2.5 text-xs font-semibold text-white/30 cursor-not-allowed">
                                <Star size={13} /> Favori
                            </button>
                        )}
                    </div>

                    {wallet && (
                        <div className="text-center text-[11px] text-white/40">
                            Solde · <span className="font-mono text-magenta-200">{wallet.coin_balance} coins</span> ·{" "}
                            <Link to="/wallet" className="underline hover:text-white">Recharger</Link>
                        </div>
                    )}
                </div>
            </div>

            {/* Tabs */}
            <div className="mt-7 sticky top-0 z-20 -mx-4 border-b border-white/[0.06] bg-[var(--bg-base)]/90 px-4 backdrop-blur sm:-mx-5 sm:px-5">
                <div className="flex gap-1 overflow-x-auto">
                    {TABS.map(t => {
                        const Icon = t.icon;
                        const active = tab === t.id;
                        return (
                            <button
                                key={t.id}
                                onClick={() => setTab(t.id)}
                                data-testid={`profile-tab-${t.id}`}
                                className={`relative flex items-center gap-1.5 px-4 py-3.5 text-sm font-semibold transition-colors ${
                                    active ? "text-white" : "text-white/45 hover:text-white"
                                }`}
                            >
                                <Icon size={14} />
                                {t.label}
                                {t.count != null && (
                                    <span className={`rounded-full px-1.5 py-0.5 text-[10px] font-mono ${active ? "bg-magenta/20 text-magenta-200" : "bg-white/5 text-white/40"}`}>
                                        {t.count}
                                    </span>
                                )}
                                {active && <span className="absolute inset-x-3 -bottom-px h-0.5 rounded-full bg-magenta" />}
                            </button>
                        );
                    })}
                </div>
            </div>

            {/* Tab content */}
            <div className="px-4 sm:px-5 py-6">
                {tab === "posts" && <PostsTab creator={creator} onUnlock={unlock} />}
                {tab === "media" && <MediaTab creator={creator} onUnlock={unlock} />}
                {tab === "about" && <AboutTab creator={creator} topTippers={topTippers} similar={similar} />}
                {tab === "live" && isLive && (
                    <Link to={`/live/${creator.live_session_id || creator.creator_id}`}
                          data-testid="profile-live-cta"
                          className="block rounded-3xl border border-red-500/40 bg-gradient-to-br from-red-500/15 via-pink-500/10 to-transparent p-8 text-center transition-all hover:border-red-500/70">
                        <Radio size={32} className="mx-auto animate-pulse text-red-400" />
                        <div className="mt-3 font-display text-xl font-bold text-white">{creator.display_name} est en live</div>
                        <p className="mt-1 text-sm text-white/65">Rejoins la session pour interagir en temps réel.</p>
                        <div className="btn-primary mt-5 inline-flex">
                            <Radio size={14} /> Rejoindre le live
                        </div>
                    </Link>
                )}
            </div>

            {/* Modals */}
            {tipOpen && (
                <TipModal
                    creator={creator}
                    coins={tipCoins} setCoins={setTipCoins}
                    message={tipMessage} setMessage={setTipMessage}
                    onClose={() => setTipOpen(false)} onSubmit={sendTip}
                    loading={loading}
                />
            )}
            {customOpen && (
                <CustomRequestModal
                    creator={creator}
                    onClose={(success) => {
                        setCustomOpen(false);
                        if (success) { refreshWallet(); nav("/commandes"); }
                    }}
                />
            )}
            {bundleOpen && (
                <BundleModal
                    creator={creator} bundles={bundles}
                    onClose={(success) => {
                        setBundleOpen(false);
                        if (success) { refreshWallet(); load(); }
                    }}
                />
            )}
        </div>
    );
}

function Stat({ n, l }) {
    return (
        <span data-testid={`stat-${l}`}>
            <span className="font-display font-bold text-white">{Number(n).toLocaleString("fr-FR")}</span>{" "}
            <span className="text-white/45">{l}</span>
        </span>
    );
}

function PostsTab({ creator, onUnlock }) {
    const items = creator.content || [];
    if (items.length === 0) {
        return (
            <div className="rounded-3xl border border-white/[0.06] bg-[var(--bg-surface)] p-10 text-center text-white/55" data-testid="profile-no-posts">
                <Sparkles size={28} className="mx-auto text-white/20" />
                <div className="mt-3 font-display text-base font-semibold text-white/80">Aucun post pour le moment</div>
                <div className="mt-1 text-xs">Reviens plus tard, {creator.display_name} prépare son premier contenu ✨</div>
            </div>
        );
    }
    return (
        <div className="grid grid-cols-2 gap-3 sm:grid-cols-3">
            {items.map(c => (
                <PaywallContent
                    key={c.content_id}
                    content={{ ...c, unlock_price_coins: Math.round((c.unlock_price || 0) * 10) }}
                    onUnlock={onUnlock}
                />
            ))}
        </div>
    );
}

function MediaTab({ creator, onUnlock }) {
    const media = (creator.content || []).filter(c => c.is_unlocked && (c.media_url || c.thumbnail_url));
    if (media.length === 0) {
        return (
            <div className="rounded-3xl border border-white/[0.06] bg-[var(--bg-surface)] p-10 text-center text-white/55">
                <ImageIcon size={28} className="mx-auto text-white/20" />
                <div className="mt-3 font-display text-base font-semibold text-white/80">Aucun média débloqué</div>
                <div className="mt-1 text-xs">Abonne-toi pour accéder à toute la galerie.</div>
            </div>
        );
    }
    return (
        <div className="grid grid-cols-3 gap-1.5">
            {media.map(c => (
                <div key={c.content_id} data-testid={`media-${c.content_id}`}
                     className="relative aspect-square overflow-hidden rounded-xl border border-white/5 bg-[var(--bg-elevated)]">
                    <img src={c.thumbnail_url || c.media_url} alt={c.title || ""}
                         className="h-full w-full object-cover transition-transform hover:scale-105" />
                </div>
            ))}
        </div>
    );
}

function AboutTab({ creator, topTippers, similar }) {
    const attrs = [
        { label: "Pseudo", value: `@${creator.handle}` },
        creator.location && { label: "Localisation", value: creator.location },
        creator.languages?.length && { label: "Langues", value: creator.languages.join(", ") },
        creator.ethnicity && { label: "Ethnie", value: creator.ethnicity },
        creator.body_type && { label: "Silhouette", value: creator.body_type },
        creator.sub_culture && { label: "Sous-culture", value: creator.sub_culture },
        creator.member_since && { label: "Membre depuis", value: new Date(creator.member_since).toLocaleDateString("fr-FR", { month: "long", year: "numeric" }) },
    ].filter(Boolean);

    return (
        <div className="space-y-5">
            {/* About card */}
            <div className="rounded-3xl border border-white/[0.06] bg-[var(--bg-surface)] p-5">
                <div className="overline mb-3 flex items-center gap-1.5"><Info size={11} /> À propos de moi</div>
                {creator.bio ? (
                    <p className="whitespace-pre-line text-sm leading-relaxed text-white/80">{creator.bio}</p>
                ) : (
                    <div className="text-sm text-white/40">Aucune description.</div>
                )}
            </div>

            {/* Attributes */}
            {attrs.length > 0 && (
                <div className="rounded-3xl border border-white/[0.06] bg-[var(--bg-surface)] p-5">
                    <div className="overline mb-3 flex items-center gap-1.5"><Calendar size={11} /> Détails</div>
                    <dl className="grid gap-3 sm:grid-cols-2">
                        {attrs.map(a => (
                            <div key={a.label}>
                                <dt className="text-[11px] uppercase tracking-widest text-white/40">{a.label}</dt>
                                <dd className="mt-0.5 text-sm font-medium text-white">{a.value}</dd>
                            </div>
                        ))}
                    </dl>
                </div>
            )}

            {/* Top tippers */}
            {topTippers.length > 0 && (
                <div className="rounded-3xl border border-white/[0.06] bg-[var(--bg-surface)] p-5" data-testid="top-tippers-card">
                    <div className="overline mb-3 flex items-center gap-1.5"><Trophy size={11} className="text-amber-300" /> Top supporters</div>
                    <div className="space-y-2">
                        {topTippers.map(tip => (
                            <div key={tip.user_id} data-testid={`top-tipper-${tip.rank}`}
                                 className="flex items-center gap-3 rounded-2xl border border-white/5 bg-white/[0.02] p-3">
                                <div className="relative h-10 w-10 shrink-0 overflow-hidden rounded-2xl border border-white/10 bg-white/[0.05]">
                                    {tip.avatar_url
                                        ? <img src={tip.avatar_url} alt="" className="h-full w-full object-cover" />
                                        : <div className="flex h-full w-full items-center justify-center text-sm font-bold">{tip.name?.[0]?.toUpperCase() || "?"}</div>
                                    }
                                    <div className={`absolute -top-1 -right-1 flex h-4 w-4 items-center justify-center rounded-full border border-[var(--bg-base)] text-[9px] font-bold ${
                                        tip.rank === 1 ? "bg-amber-400 text-black"
                                            : tip.rank === 2 ? "bg-slate-300 text-black"
                                            : "bg-orange-500 text-black"}`}>
                                        {tip.rank}
                                    </div>
                                </div>
                                <div className="flex-1 min-w-0">
                                    <div className="flex items-center gap-1.5">
                                        <span className="truncate text-sm font-semibold">{tip.name}</span>
                                        {tip.badge && <FidelityBadge badge={tip.badge} size="sm" />}
                                    </div>
                                </div>
                                <div className="flex items-center gap-1 font-mono text-sm text-magenta-200">
                                    <Coins size={11} /> {tip.total_coins}
                                </div>
                            </div>
                        ))}
                    </div>
                </div>
            )}

            {/* Similar */}
            {similar.length > 0 && (
                <div className="rounded-3xl border border-white/[0.06] bg-[var(--bg-surface)] p-5" data-testid="similar-creators">
                    <div className="overline mb-3 flex items-center gap-1.5"><Sparkles size={11} className="text-magenta-200" /> Similaires</div>
                    <div className="grid grid-cols-2 gap-2 sm:grid-cols-4">
                        {similar.map(s => (
                            <Link key={s.creator_id} to={`/createur/${s.creator_id}`}
                                  data-testid={`similar-${s.creator_id}`}
                                  className="group block">
                                <div className="aspect-[3/4] overflow-hidden rounded-xl border border-white/10 bg-white/[0.03]">
                                    <img src={avatarUrl(s)} alt={s.display_name} onError={onAvatarError} className="h-full w-full object-cover transition-transform group-hover:scale-105" />
                                </div>
                                <div className="mt-1.5 truncate text-xs font-semibold">{s.display_name}</div>
                                <div className="truncate text-[10px] text-white/45">@{s.handle}</div>
                            </Link>
                        ))}
                    </div>
                </div>
            )}
        </div>
    );
}

function TipModal({ creator, coins, setCoins, message, setMessage, onClose, onSubmit, loading }) {
    return (
        <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/80 backdrop-blur p-4" role="dialog">
            <div className="w-full max-w-md rounded-3xl border border-white/10 bg-[var(--bg-surface)] p-6">
                <div className="flex items-center justify-between">
                    <h3 className="font-display text-xl font-bold">Pourboire pour {creator.display_name}</h3>
                    <button onClick={onClose} data-testid="tip-close" className="rounded-full p-1 text-white/50 hover:bg-white/5 hover:text-white"><X size={16} /></button>
                </div>
                <div className="mt-4 grid grid-cols-4 gap-2">
                    {[25, 50, 100, 250].map(v => (
                        <button key={v} data-testid={`tip-preset-${v}`}
                                onClick={() => setCoins(v)}
                                className={`rounded-2xl border px-3 py-3 font-semibold transition-all ${coins === v ? "border-magenta bg-magenta/15" : "border-white/10 hover:border-white/20"}`}>
                            <div className="font-mono text-base">{v}</div>
                            <div className="text-[10px] text-white/40">coins</div>
                        </button>
                    ))}
                </div>
                <input data-testid="tip-amount" type="number" min={1} max={10000}
                       value={coins} onChange={e => setCoins(Number(e.target.value))}
                       className="input-base mt-3 font-mono" />
                <textarea data-testid="tip-message" placeholder="Message (optionnel)"
                          value={message} onChange={e => setMessage(e.target.value)}
                          className="input-base mt-3 min-h-[80px]" />
                <button data-testid="tip-submit" disabled={loading} onClick={onSubmit}
                        className="btn-primary mt-4 w-full justify-center">
                    {loading ? "Envoi…" : `Envoyer ${coins} coins`}
                </button>
            </div>
        </div>
    );
}

function BundleModal({ creator, bundles, onClose }) {
    const [selected, setSelected] = useState(bundles.find(b => b.discount_percent > 0) || bundles[0]);
    const [loading, setLoading] = useState(false);
    const [stripeLoading, setStripeLoading] = useState(false);
    const [err, setErr] = useState("");

    const submit = async () => {
        setErr(""); setLoading(true);
        try {
            await api.post("/payments/subscribe-bundle", { creator_id: creator.creator_id, months: selected.months });
            onClose(true);
        } catch (e) {
            const d = e.response?.data?.detail;
            if (d?.error === "insufficient_coins") setErr(`Solde insuffisant (${d.balance}/${d.needed} coins). Utilise "Payer par carte" ci-dessous.`);
            else setErr(formatApiError(d) || e.message);
            setLoading(false);
        }
    };

    const payStripe = async () => {
        setErr(""); setStripeLoading(true);
        try {
            const { data } = await api.post("/payments/subscribe-bundle-stripe", {
                creator_id: creator.creator_id, months: selected.months, origin_url: window.location.origin,
            });
            if (data?.url) window.location.href = data.url;
            else { setErr("URL Stripe indisponible."); setStripeLoading(false); }
        } catch (e) {
            setErr(formatApiError(e.response?.data?.detail) || e.message);
            setStripeLoading(false);
        }
    };

    return (
        <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/80 backdrop-blur p-4" data-testid="bundle-modal">
            <div className="w-full max-w-xl max-h-[92vh] overflow-y-auto rounded-3xl border border-amber-500/30 bg-[var(--bg-surface)] p-6">
                <div className="flex items-center justify-between">
                    <h3 className="font-display text-xl font-bold flex items-center gap-2">
                        <Package size={18} className="text-amber-300" /> Packs · {creator.display_name}
                    </h3>
                    <button onClick={() => onClose(false)} className="rounded-full p-1 text-white/50 hover:bg-white/5"><X size={16} /></button>
                </div>
                <p className="mt-2 text-sm text-white/60">Choisis la durée. Plus c'est long, plus c'est avantageux.</p>
                <div className="mt-5 grid gap-3 sm:grid-cols-2">
                    {bundles.map(b => {
                        const active = selected?.months === b.months;
                        return (
                            <button key={b.months} onClick={() => setSelected(b)}
                                    data-testid={`bundle-option-${b.months}`}
                                    className={`relative text-left rounded-2xl border p-4 transition-all ${active ? "border-magenta bg-magenta/10" : "border-white/10 bg-white/[0.02] hover:border-white/20"}`}>
                                {b.discount_percent > 0 && (
                                    <div className="absolute -top-2 right-3 rounded-full bg-gradient-to-r from-amber-500 to-magenta px-2 py-0.5 text-[10px] font-bold text-white">
                                        -{b.discount_percent}%
                                    </div>
                                )}
                                <div className="font-display text-2xl font-bold">{b.months} mois</div>
                                <div className="mt-1 text-xs text-white/50">{b.monthly_eur.toFixed(2)} € / mois</div>
                                <div className="mt-3 flex items-center gap-1 font-mono text-lg font-bold text-magenta-200">
                                    <Coins size={14} /> {b.total_coins}
                                </div>
                                <div className="text-[11px] text-white/50">Total · {b.total_eur.toFixed(2)} €</div>
                                {b.saved_eur > 0 && (
                                    <div className="mt-2 text-[11px] font-semibold text-amber-300">
                                        Tu économises {b.saved_eur.toFixed(2)} €
                                    </div>
                                )}
                            </button>
                        );
                    })}
                </div>
                {err && <div className="mt-4 rounded-2xl border border-red-500/30 bg-red-500/10 p-3 text-sm text-red-300" data-testid="bundle-error">{err}</div>}
                <div className="mt-5 grid gap-2 sm:grid-cols-2">
                    <button onClick={payStripe} disabled={stripeLoading || loading || !selected}
                            className="btn-primary justify-center" data-testid="bundle-stripe-submit">
                        <CreditCard size={14} /> {stripeLoading ? "Redirection…" : `Payer ${selected?.total_eur.toFixed(2)} € par carte`}
                    </button>
                    <button onClick={submit} disabled={loading || stripeLoading || !selected}
                            className="btn-ghost justify-center" data-testid="bundle-submit">
                        <Zap size={14} /> {loading ? "…" : `Payer ${selected?.total_coins} coins`}
                    </button>
                </div>
                <button onClick={() => onClose(false)} className="mt-2 w-full rounded-full px-4 py-2 text-xs text-white/50 hover:text-white" data-testid="bundle-cancel-btn">
                    Annuler
                </button>
            </div>
        </div>
    );
}

function CustomRequestModal({ creator, onClose }) {
    const [description, setDescription] = useState("");
    const [priceCoins, setPriceCoins] = useState(100);
    const [loading, setLoading] = useState(false);
    const [err, setErr] = useState("");

    const submit = async (e) => {
        e.preventDefault(); setErr(""); setLoading(true);
        try {
            await api.post(`/creators/${creator.creator_id}/custom-request`, { description, price_coins: priceCoins });
            onClose(true);
        } catch (e) {
            const d = e.response?.data?.detail;
            if (d?.error === "insufficient_coins") setErr(`Solde insuffisant (il te faut ${d.needed} coins, tu as ${d.balance}).`);
            else setErr(formatApiError(d) || e.message);
            setLoading(false);
        }
    };

    return (
        <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/80 backdrop-blur p-4" data-testid="custom-request-modal">
            <form onSubmit={submit} className="w-full max-w-md rounded-3xl border border-magenta/30 bg-[var(--bg-surface)] p-6">
                <div className="flex items-center justify-between">
                    <h3 className="font-display text-xl font-bold">Commande perso</h3>
                    <button type="button" onClick={() => onClose(false)} className="rounded-full p-1 text-white/50"><X size={16} /></button>
                </div>
                <p className="mt-2 text-sm text-white/60">Décris précisément ce que tu aimerais recevoir de {creator.display_name}.</p>
                <div className="mt-4 space-y-3">
                    <textarea required className="input-base min-h-[100px] resize-none" rows={4}
                              maxLength={500}
                              placeholder="Ex : une photo en robe rouge, un message vocal, une vidéo de 30s avec ton chien…"
                              value={description} onChange={e => setDescription(e.target.value)}
                              data-testid="custom-desc" />
                    <div>
                        <label className="text-xs text-white/60">Prix proposé (en coins)</label>
                        <div className="mt-2 flex gap-2">
                            {[50, 100, 250, 500].map(v => (
                                <button type="button" key={v} onClick={() => setPriceCoins(v)}
                                        data-testid={`custom-preset-${v}`}
                                        className={`flex-1 rounded-xl border px-3 py-2 font-mono transition-all ${priceCoins === v ? "border-magenta bg-magenta/20" : "border-white/10"}`}>
                                    {v}
                                </button>
                            ))}
                        </div>
                        <input type="number" min={50} max={10000} required
                               value={priceCoins} onChange={e => setPriceCoins(Number(e.target.value))}
                               data-testid="custom-price" className="input-base mt-2 font-mono" />
                    </div>
                    {err && <div className="rounded-lg border border-red-500/30 bg-red-500/10 p-3 text-sm text-red-300">{err}</div>}
                    <button type="submit" disabled={loading || !description.trim()} className="btn-primary w-full justify-center" data-testid="custom-submit">
                        {loading ? "Envoi…" : `Envoyer la demande · ${priceCoins} coins`}
                    </button>
                </div>
            </form>
        </div>
    );
}
