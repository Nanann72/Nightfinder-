import { useEffect, useState } from "react";
import { api } from "@/lib/api";
import { useAuth, formatApiError } from "@/lib/auth";
import FileUploader from "@/components/FileUploader";
import BroadcastModal from "@/components/BroadcastModal";
import { refreshWallet } from "@/components/WalletChip";
import { Link } from "react-router-dom";
import { Users, Coins, Wallet as WalletIcon, Image as ImageIcon, TrendingUp, Plus, X, Sparkles, Clock, ArrowDownToLine, Pencil, Save, Video, Megaphone, CreditCard, ExternalLink, AlertTriangle, CheckCircle2, Rocket } from "lucide-react";
import LiveSettings from "@/components/LiveSettings";
import PushOptInCard from "@/components/PushOptInCard";
import MyPosts from "@/components/MyPosts";
import BulkUploadModal from "@/components/BulkUploadModal";
import CategoryPicker from "@/components/CategoryPicker";
import DashboardShareCard from "@/components/DashboardShareCard";

export default function Dashboard() {
    const { user, refreshUser } = useAuth();
    const [data, setData] = useState(null);
    const [stories, setStories] = useState([]);
    const [payouts, setPayouts] = useState([]);
    const [err, setErr] = useState("");
    const [savedMsg, setSavedMsg] = useState("");
    const [addOpen, setAddOpen] = useState(false);
    const [storyOpen, setStoryOpen] = useState(false);
    const [payoutOpen, setPayoutOpen] = useState(false);
    const [editOpen, setEditOpen] = useState(false);
    const [broadcastOpen, setBroadcastOpen] = useState(false);
    const [bulkOpen, setBulkOpen] = useState(false);
    const [postsReloadKey, setPostsReloadKey] = useState(0);

    const load = async () => {
        try {
            const d = await api.get("/creators/me/dashboard");
            setData(d.data);
            const sr = await api.get("/stories");
            const mine = sr.data.find(s => s.creator_id === d.data.creator?.creator_id);
            setStories(mine?.stories || []);
            const p = await api.get("/payouts");
            setPayouts(p.data);
        } catch (e) {
            setErr(formatApiError(e.response?.data?.detail));
        }
    };
    useEffect(() => { load(); }, []);

    if (err) {
        return (
            <div className="container-mx py-16">
                <div className="surface-card p-8 text-center" data-testid="dashboard-error">
                    <p className="text-white/70">{err}</p>
                    <p className="mt-2 text-sm text-white/40">Tu dois avoir un profil créatrice pour accéder au dashboard.</p>
                </div>
            </div>
        );
    }
    if (!data) return <div className="container-mx py-16 text-white/40" data-testid="dashboard-loading">Chargement…</div>;

    const { creator } = data;
    const stats = [
        { label: "Solde (coins)", value: data.wallet_balance_coins, sub: `≈ ${data.available_eur.toFixed(2)} €`, icon: WalletIcon, accent: true },
        { label: "Abonnés actifs", value: data.subscribers_count, icon: Users },
        { label: "Ce mois (coins)", value: data.monthly_earned_coins, sub: `${data.monthly_earned_eur.toFixed(2)} € net`, icon: TrendingUp },
        { label: "Contenus publiés", value: data.content_count, icon: ImageIcon },
    ];

    return (
        <div className="relative z-10 container-mx py-6 sm:py-10">
            {savedMsg && (
                <div data-testid="dashboard-saved-msg"
                     className="fixed top-20 left-1/2 z-[70] -translate-x-1/2 rounded-full border border-green-500/40 bg-green-500/20 px-5 py-2.5 text-sm font-semibold text-green-200 backdrop-blur-lg shadow-lg animate-pulse">
                    {savedMsg}
                </div>
            )}
            <div className="flex flex-col gap-4 sm:flex-row sm:items-start sm:justify-between">
                <div className="min-w-0">
                    <div className="overline">Dashboard créatrice</div>
                    <h1 className="mt-2 font-display text-3xl font-bold sm:text-4xl">
                        Salut, <span className="block sm:inline">{creator?.display_name} 💫</span>
                    </h1>
                    <p className="mt-2 text-sm text-white/50 sm:text-base">Voici un aperçu de ton compte et de tes revenus.</p>
                </div>
                <div className="flex flex-wrap gap-2">
                    <Link to="/dashboard/analytics" data-testid="dashboard-analytics-btn" className="inline-flex items-center gap-1.5 rounded-full border border-white/10 bg-white/[0.03] px-4 py-2 text-sm font-semibold text-white/80 hover:bg-white/[0.08] transition-colors">
                        <TrendingUp size={16} /> Analytics
                    </Link>
                    <Link to="/live/start" data-testid="dashboard-go-live-btn" className="inline-flex items-center gap-1.5 rounded-full border border-red-500/40 bg-red-500/10 px-4 py-2 text-sm font-semibold text-red-300 hover:bg-red-500/20 transition-colors">
                        <Video size={16} /> Go Live
                    </Link>
                    <button onClick={() => setBroadcastOpen(true)} data-testid="dashboard-broadcast-btn" className="inline-flex items-center gap-1.5 rounded-full border border-magenta/40 bg-magenta/10 px-4 py-2 text-sm font-semibold text-magenta-200 hover:bg-magenta/20 transition-colors">
                        <Megaphone size={16} /> Message groupé
                    </button>
                    <button onClick={() => setStoryOpen(true)} data-testid="add-story-btn" className="btn-outline-magenta">
                        <Sparkles size={16} /> Story
                    </button>
                    <button onClick={() => setAddOpen(true)} data-testid="add-content-btn" className="btn-outline-magenta">
                        <Plus size={16} /> Nouveau post
                    </button>
                    <button onClick={() => setBulkOpen(true)} data-testid="bulk-upload-btn" className="btn-primary">
                        <Rocket size={16} /> Upload groupé
                    </button>
                </div>
            </div>

            <div className="mt-6 grid gap-4 grid-cols-2 lg:grid-cols-4 sm:mt-8">
                {stats.map((s) => {
                    const Icon = s.icon;
                    return (
                        <div key={s.label} data-testid={`stat-${s.label}`}
                             className={`surface-card relative overflow-hidden ${s.accent ? "border-magenta/30" : ""}`}>
                            <div className={`inline-flex h-10 w-10 items-center justify-center rounded-xl border ${s.accent ? "border-magenta/40 bg-magenta/10 text-magenta-200" : "border-white/10 bg-white/[0.03] text-white/60"}`}>
                                <Icon size={18} />
                            </div>
                            <div className="mt-5 font-mono text-2xl font-bold sm:text-3xl break-all">{s.value}</div>
                            <div className="mt-1 text-[10px] uppercase tracking-widest text-white/40 sm:text-xs">{s.label}</div>
                            {s.sub && <div className="mt-1 text-[11px] text-white/50 sm:text-xs">{s.sub}</div>}
                        </div>
                    );
                })}
            </div>

            {/* Share link + AI flyer generator */}
            <div className="mt-8">
                <DashboardShareCard />
            </div>

            {/* Editable profile card */}
            <div className="mt-8 surface-card" data-testid="editable-profile-card">
                <div className="flex items-start justify-between gap-3">
                    <div className="overline">Mon profil public</div>
                    <button onClick={() => setEditOpen(true)} data-testid="edit-profile-btn"
                            className="inline-flex items-center gap-1.5 rounded-full border border-white/10 bg-white/[0.03] px-3 py-1.5 text-xs text-white/70 transition-colors hover:border-magenta/40 hover:bg-magenta/10 hover:text-white">
                        <Pencil size={12} /> Modifier
                    </button>
                </div>
                {creator?.cover_url && (
                    <div className="relative mt-4 h-32 overflow-hidden rounded-xl sm:h-40">
                        <img src={creator.cover_url} alt="" className="h-full w-full object-cover" />
                    </div>
                )}
                <div className="mt-4 flex flex-col gap-4 sm:flex-row sm:items-center">
                    <div className="h-20 w-20 shrink-0 overflow-hidden rounded-2xl border border-white/10 bg-white/[0.03]">
                        {creator?.avatar_url && <img src={creator.avatar_url} alt="" className="h-full w-full object-cover" />}
                    </div>
                    <div className="min-w-0 flex-1">
                        <div className="font-display text-xl font-semibold">{creator?.display_name}</div>
                        <div className="text-sm text-white/50">@{creator?.handle}</div>
                        <div className="mt-1 text-sm text-white/60 line-clamp-2">{creator?.bio || "Ajoute une biographie."}</div>
                        {creator?.tags?.length > 0 && (
                            <div className="mt-2 flex flex-wrap gap-1.5">
                                {creator.tags.map(t => (
                                    <span key={t} className="rounded-full border border-white/10 bg-white/[0.03] px-2 py-0.5 text-[11px] text-white/60">#{t}</span>
                                ))}
                            </div>
                        )}
                    </div>
                    <div className="shrink-0 rounded-full border border-magenta/40 bg-magenta/10 px-3 py-1 text-sm font-mono text-magenta-200">
                        {Math.round((creator?.subscription_price || 0) * 10)} coins / mois
                    </div>
                </div>
            </div>

            {/* Payout card */}
            <div className="mt-8 surface-card border-magenta/20" data-testid="payout-card">
                <div className="flex flex-col gap-4 md:flex-row md:items-center md:justify-between">
                    <div className="min-w-0">
                        <div className="overline flex items-center gap-2"><Coins size={12} /> Retrait</div>
                        <div className="mt-2 font-display text-xl font-bold sm:text-2xl">
                            <span className="font-mono">{data.wallet_balance_coins}</span> coins disponibles
                        </div>
                        <div className="text-sm text-white/50">
                            ≈ <span className="font-mono text-magenta-200">{data.available_eur.toFixed(2)} €</span> (après commission 20 %)
                        </div>
                        <div className="mt-1 text-xs text-white/40">Minimum retrait : {data.payout_min_coins} coins</div>
                    </div>
                    <button
                        onClick={() => setPayoutOpen(true)}
                        disabled={data.wallet_balance_coins < data.payout_min_coins}
                        data-testid="payout-request-btn"
                        className="btn-primary disabled:opacity-40 disabled:cursor-not-allowed shrink-0"
                    >
                        <ArrowDownToLine size={16} /> Demander un retrait
                    </button>
                </div>
                <a href="/bank" data-testid="bank-link"
                   className="mt-3 inline-flex items-center gap-1 text-xs text-magenta-200 hover:text-white">
                    Gérer mon IBAN / compte bancaire →
                </a>
                {payouts.length > 0 && (
                    <div className="mt-6 -mx-6 overflow-x-auto border-t border-white/5 sm:mx-0 sm:rounded-xl sm:border">
                        <table className="w-full min-w-[500px] text-sm">
                            <thead className="border-b border-white/5 text-left text-[11px] uppercase tracking-widest text-white/40">
                                <tr><th className="px-4 py-2">Date</th><th className="px-4 py-2">Coins</th><th className="px-4 py-2">Net EUR</th><th className="px-4 py-2">Statut</th></tr>
                            </thead>
                            <tbody>
                                {payouts.map(p => (
                                    <tr key={p.request_id} className="border-b border-white/5 last:border-0" data-testid={`payout-${p.request_id}`}>
                                        <td className="px-4 py-2 text-white/60">{new Date(p.created_at).toLocaleDateString("fr-FR")}</td>
                                        <td className="px-4 py-2 font-mono">{p.coins}</td>
                                        <td className="px-4 py-2 font-mono text-magenta-200">{p.eur_value.toFixed(2)} €</td>
                                        <td className="px-4 py-2">
                                            <span className={`rounded-full px-2 py-0.5 text-xs ${p.status === "pending" ? "bg-amber-500/20 text-amber-200" : p.status === "paid" ? "bg-green-500/20 text-green-300" : "bg-white/10"}`}>
                                                {p.status}
                                            </span>
                                        </td>
                                    </tr>
                                ))}
                            </tbody>
                        </table>
                    </div>
                )}
            </div>

            {/* Stories */}
            <div className="mt-8 surface-card">
                <div className="overline flex items-center gap-2"><Clock size={12} /> Stories actives (24h) · {stories.length}</div>
                {stories.length > 0 && (
                    <div className="mt-4 flex gap-3 overflow-x-auto pb-2">
                        {stories.map(s => (
                            <div key={s.story_id} className="relative h-24 w-24 shrink-0 overflow-hidden rounded-xl border border-magenta/30">
                                <img src={s.media_url} alt="" className="h-full w-full object-cover" />
                            </div>
                        ))}
                    </div>
                )}
            </div>

            <StripeConnectCard />
            <MyPosts reloadSignal={postsReloadKey} />
            <PushOptInCard />
            <LiveSettings />

            {addOpen && <AddContentModal onClose={() => { setAddOpen(false); setPostsReloadKey(k => k + 1); load(); }} />}
            {bulkOpen && <BulkUploadModal onClose={() => { setBulkOpen(false); setPostsReloadKey(k => k + 1); load(); }} onCreated={() => { setPostsReloadKey(k => k + 1); load(); }} />}
            {storyOpen && <AddStoryModal onClose={() => { setStoryOpen(false); load(); }} />}
            {broadcastOpen && <BroadcastModal onClose={() => setBroadcastOpen(false)} />}
            {editOpen && <EditProfileModal creator={creator} onClose={(saved) => { setEditOpen(false); if (saved) { load(); refreshUser(); setSavedMsg("Profil enregistré ✓"); setTimeout(() => setSavedMsg(""), 3000); } }} />}
            {payoutOpen && (
                <PayoutModal
                    maxCoins={data.wallet_balance_coins}
                    minCoins={data.payout_min_coins}
                    onClose={(success) => { setPayoutOpen(false); if (success) { refreshWallet(); load(); } }}
                />
            )}
        </div>
    );
}

function EditProfileModal({ creator, onClose }) {
    const [form, setForm] = useState({
        display_name: creator?.display_name || "",
        handle: creator?.handle || "",
        bio: creator?.bio || "",
        subscription_price: String(creator?.subscription_price ?? 9.99),
        avatar_url: creator?.avatar_url || "",
        cover_url: creator?.cover_url || "",
        tags: creator?.tags || [],
        external_url: creator?.external_url || "",
        // Stripchat-style profile
        about_me: creator?.about_me || "",
        languages: creator?.languages || [],
        body_type: creator?.body_type || "",
        ethnicity: creator?.ethnicity || "",
        hair_color: creator?.hair_color || "",
        eye_color: creator?.eye_color || "",
        sub_culture: creator?.sub_culture || "",
        // Live show pricing (coins/min, except ticket)
        price_private_per_min:   creator?.price_private_per_min   ?? 0,
        price_exclusive_per_min: creator?.price_exclusive_per_min ?? 0,
        price_spy_per_min:       creator?.price_spy_per_min       ?? 0,
        price_group_per_min:     creator?.price_group_per_min     ?? 0,
        price_ticket_show:       creator?.price_ticket_show       ?? 0,
        // Social links
        social_instagram: creator?.social_instagram || "",
        social_twitter:   creator?.social_twitter   || "",
        social_tiktok:    creator?.social_tiktok    || "",
        social_youtube:   creator?.social_youtube   || "",
    });
    const [err, setErr] = useState("");
    const [loading, setLoading] = useState(false);

    const submit = async (e) => {
        e.preventDefault(); setErr(""); setLoading(true);
        try {
            // Defensive: prevent empty/NaN subscription_price from reaching API (fail-safe UX)
            const priceNum = Number(form.subscription_price);
            if (!Number.isFinite(priceNum) || priceNum < 0) {
                setErr("Le prix d'abonnement doit être un nombre positif (ex: 9.99).");
                setLoading(false);
                return;
            }
            if (!form.display_name.trim() || !form.handle.trim()) {
                setErr("Nom d'affichage et pseudo sont obligatoires.");
                setLoading(false);
                return;
            }
            const payload = {
                display_name: form.display_name.trim(),
                handle: form.handle.trim().toLowerCase().replace(/[^a-z0-9_]/g, ""),
                bio: form.bio,
                subscription_price: priceNum,
                avatar_url: form.avatar_url || null,
                cover_url: form.cover_url || null,
                tags: (form.tags || []).slice(0, 6),
                external_url: (form.external_url || "").trim() || null,
                // Stripchat-style profile
                about_me:    form.about_me || null,
                languages:   form.languages.length ? form.languages : null,
                body_type:   form.body_type || null,
                ethnicity:   form.ethnicity || null,
                hair_color:  form.hair_color || null,
                eye_color:   form.eye_color || null,
                sub_culture: form.sub_culture || null,
                // Live show pricing (coins/min)
                price_private_per_min:   Number(form.price_private_per_min)   || 0,
                price_exclusive_per_min: Number(form.price_exclusive_per_min) || 0,
                price_spy_per_min:       Number(form.price_spy_per_min)       || 0,
                price_group_per_min:     Number(form.price_group_per_min)     || 0,
                price_ticket_show:       Number(form.price_ticket_show)       || 0,
                // Social
                social_instagram: form.social_instagram || null,
                social_twitter:   form.social_twitter   || null,
                social_tiktok:    form.social_tiktok    || null,
                social_youtube:   form.social_youtube   || null,
            };
            await api.patch("/creators/me", payload);
            onClose(true);
        } catch (e) {
            setErr(formatApiError(e.response?.data?.detail) || e.message || "Impossible d'enregistrer les modifications.");
            setLoading(false);
        }
    };

    return (
        <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/80 backdrop-blur p-4">
            <form onSubmit={submit} className="w-full max-w-2xl max-h-[92vh] overflow-y-auto rounded-2xl border border-white/10 bg-surface p-6" data-testid="edit-profile-modal">
                <div className="flex items-center justify-between">
                    <h3 className="font-display text-xl font-bold">Modifier mon profil</h3>
                    <button type="button" onClick={() => onClose(false)} data-testid="edit-profile-close" className="rounded-full p-1 text-white/50 hover:bg-white/5 hover:text-white"><X size={16} /></button>
                </div>

                <div className="mt-5 grid gap-4 sm:grid-cols-2">
                    <div>
                        <label className="text-xs text-white/60">Nom d'affichage</label>
                        <input className="input-base mt-1" required value={form.display_name}
                               onChange={e => setForm({ ...form, display_name: e.target.value })}
                               data-testid="edit-display-name" />
                    </div>
                    <div>
                        <label className="text-xs text-white/60">Pseudo (@handle)</label>
                        <input className="input-base mt-1 font-mono" required value={form.handle}
                               onChange={e => setForm({ ...form, handle: e.target.value })}
                               data-testid="edit-handle" />
                    </div>
                </div>

                <div className="mt-4">
                    <label className="text-xs text-white/60">Biographie</label>
                    <textarea className="input-base mt-1 min-h-[80px] resize-none" rows={3}
                              placeholder="Présente-toi en quelques lignes…"
                              value={form.bio}
                              onChange={e => setForm({ ...form, bio: e.target.value })}
                              data-testid="edit-bio" />
                </div>

                <div className="mt-4">
                    <label className="text-xs text-white/60">Prix abonnement (€ / mois)</label>
                    <input type="number" min="0" step="0.01" required
                           className="input-base mt-1 font-mono w-full sm:w-1/2"
                           value={form.subscription_price}
                           onChange={e => setForm({ ...form, subscription_price: e.target.value })}
                           onBlur={e => { if (!e.target.value.trim()) setForm({ ...form, subscription_price: "9.99" }); }}
                           data-testid="edit-price" />
                    <p className="mt-1 text-[11px] text-white/40">= {Math.round(Number(form.subscription_price || 0) * 10)} coins / mois</p>
                </div>

                <div className="mt-5">
                    <label className="text-xs text-white/60">Catégories</label>
                    <div className="mt-2">
                        <CategoryPicker
                            selected={form.tags}
                            onChange={(next) => setForm({ ...form, tags: next })}
                            max={6}
                            testIdPrefix="edit-categories"
                        />
                    </div>
                </div>

                <div className="mt-4">
                    <label className="text-xs text-white/60">Lien externe (Instagram, TikTok, site perso…)</label>
                    <input type="url" placeholder="https://instagram.com/tonpseudo"
                           className="input-base mt-1"
                           value={form.external_url}
                           onChange={e => setForm({ ...form, external_url: e.target.value })}
                           data-testid="edit-external-url" />
                    <p className="mt-1 text-[11px] text-white/40">Apparaît en lien cliquable sur ton profil public.</p>
                </div>

                <div className="mt-5">
                    <label className="text-xs text-white/60">Photo de profil</label>
                    <div className="mt-2 flex items-center gap-3">
                        <div className="h-16 w-16 overflow-hidden rounded-xl border border-white/10 bg-white/[0.03]">
                            {form.avatar_url && <img src={form.avatar_url} alt="" className="h-full w-full object-cover" />}
                        </div>
                        <div className="flex-1">
                            <FileUploader value={form.avatar_url} onChange={(url) => setForm({ ...form, avatar_url: url })} label="Changer l'avatar" testId="edit-avatar-uploader" />
                        </div>
                    </div>
                </div>

                <div className="mt-4">
                    <label className="text-xs text-white/60">Couverture</label>
                    <div className="mt-2 space-y-2">
                        {form.cover_url && (
                            <div className="h-24 overflow-hidden rounded-xl border border-white/10">
                                <img src={form.cover_url} alt="" className="h-full w-full object-cover" />
                            </div>
                        )}
                        <FileUploader value={form.cover_url} onChange={(url) => setForm({ ...form, cover_url: url })} label="Changer la couverture" testId="edit-cover-uploader" />
                    </div>
                </div>

                {/* ───────── Stripchat-style profile fields ───────── */}
                <div className="mt-6 rounded-2xl border border-magenta/20 bg-gradient-to-br from-magenta/5 via-transparent to-transparent p-4">
                    <div className="overline mb-3">À propos de moi</div>
                    <textarea
                        rows={4} maxLength={2000}
                        placeholder="Parle un peu de toi : ce qui te passionne, ton style, tes envies…"
                        value={form.about_me}
                        onChange={(e) => setForm({ ...form, about_me: e.target.value })}
                        data-testid="edit-about-me"
                        className="input-base text-sm"
                    />
                    <div className="mt-4 grid gap-3 sm:grid-cols-2">
                        <Selector
                            label="Type de silhouette"
                            value={form.body_type}
                            onChange={(v) => setForm({ ...form, body_type: v })}
                            options={["athletic", "curvy", "slim", "average", "plus"]}
                            labels={{ athletic: "Athlétique", curvy: "Pulpeuse", slim: "Mince", average: "Moyenne", plus: "Plus size" }}
                            testId="edit-body-type"
                        />
                        <Selector
                            label="Origine"
                            value={form.ethnicity}
                            onChange={(v) => setForm({ ...form, ethnicity: v })}
                            options={["caucasian", "latina", "asian", "african", "middle_eastern", "mixed"]}
                            labels={{ caucasian: "Caucasienne", latina: "Latina", asian: "Asiatique", african: "Africaine", middle_eastern: "Moyen-Orient", mixed: "Métisse" }}
                            testId="edit-ethnicity"
                        />
                        <Selector
                            label="Couleur de cheveux"
                            value={form.hair_color}
                            onChange={(v) => setForm({ ...form, hair_color: v })}
                            options={["black", "brown", "blonde", "red", "other"]}
                            labels={{ black: "Noir", brown: "Brun", blonde: "Blond", red: "Roux", other: "Autre" }}
                            testId="edit-hair-color"
                        />
                        <Selector
                            label="Couleur des yeux"
                            value={form.eye_color}
                            onChange={(v) => setForm({ ...form, eye_color: v })}
                            options={["brown", "blue", "green", "hazel", "grey"]}
                            labels={{ brown: "Marron", blue: "Bleus", green: "Verts", hazel: "Noisette", grey: "Gris" }}
                            testId="edit-eye-color"
                        />
                        <Selector
                            label="Style / sub-culture"
                            value={form.sub_culture}
                            onChange={(v) => setForm({ ...form, sub_culture: v })}
                            options={["casual", "gamer", "sporty", "artsy", "classic", "alternative"]}
                            labels={{ casual: "Décontractée", gamer: "Gameuse", sporty: "Sportive", artsy: "Arty", classic: "Classique", alternative: "Alternative" }}
                            testId="edit-sub-culture"
                        />
                        <div>
                            <label className="text-xs text-white/60">Langues parlées</label>
                            <input
                                value={form.languages.join(", ")}
                                onChange={(e) => setForm({ ...form, languages: e.target.value.split(",").map((s) => s.trim()).filter(Boolean).slice(0, 10) })}
                                placeholder="Français, Anglais…"
                                data-testid="edit-languages"
                                className="input-base mt-1 text-sm"
                            />
                        </div>
                    </div>
                </div>

                {/* ───────── Live show pricing ───────── */}
                <div className="mt-4 rounded-2xl border border-amber-500/20 bg-gradient-to-br from-amber-500/5 via-transparent to-transparent p-4">
                    <div className="overline mb-3">Tarifs en live (coins/min, 0 = désactivé)</div>
                    <div className="grid gap-3 sm:grid-cols-2">
                        <PriceField label="Privé"     value={form.price_private_per_min}   onChange={(v) => setForm({ ...form, price_private_per_min: v })}   testId="edit-price-private"   />
                        <PriceField label="Exclusif"  value={form.price_exclusive_per_min} onChange={(v) => setForm({ ...form, price_exclusive_per_min: v })} testId="edit-price-exclusive" />
                        <PriceField label="Mode espion" value={form.price_spy_per_min}    onChange={(v) => setForm({ ...form, price_spy_per_min: v })}        testId="edit-price-spy"       />
                        <PriceField label="Show de groupe" value={form.price_group_per_min} onChange={(v) => setForm({ ...form, price_group_per_min: v })}    testId="edit-price-group"     />
                        <div className="sm:col-span-2">
                            <PriceField label="Show à ticket (par ticket, pas par minute)"
                                        value={form.price_ticket_show}
                                        onChange={(v) => setForm({ ...form, price_ticket_show: v })}
                                        testId="edit-price-ticket" />
                        </div>
                    </div>
                </div>

                {/* ───────── Social links ───────── */}
                <div className="mt-4 rounded-2xl border border-white/10 bg-white/[0.02] p-4">
                    <div className="overline mb-3">Réseaux sociaux</div>
                    <div className="grid gap-2 sm:grid-cols-2">
                        {[
                            { key: "social_instagram", label: "Instagram", placeholder: "https://instagram.com/…" },
                            { key: "social_twitter",   label: "Twitter / X", placeholder: "https://x.com/…" },
                            { key: "social_tiktok",    label: "TikTok",     placeholder: "https://tiktok.com/@…" },
                            { key: "social_youtube",   label: "YouTube",    placeholder: "https://youtube.com/@…" },
                        ].map(({ key, label, placeholder }) => (
                            <div key={key}>
                                <label className="text-xs text-white/60">{label}</label>
                                <input
                                    type="url"
                                    placeholder={placeholder}
                                    value={form[key]}
                                    onChange={(e) => setForm({ ...form, [key]: e.target.value })}
                                    data-testid={`edit-${key}`}
                                    className="input-base mt-1 text-sm"
                                />
                            </div>
                        ))}
                    </div>
                </div>

                {err && <div className="mt-4 rounded-lg border border-red-500/30 bg-red-500/10 p-3 text-sm text-red-300" data-testid="edit-profile-error">{err}</div>}

                <div className="mt-6 flex gap-2">
                    <button type="button" onClick={() => onClose(false)} className="btn-ghost flex-1 justify-center">Annuler</button>
                    <button type="submit" disabled={loading} className="btn-primary flex-1 justify-center" data-testid="edit-profile-submit">
                        <Save size={16} /> {loading ? "Enregistrement…" : "Enregistrer"}
                    </button>
                </div>
            </form>
        </div>
    );
}
function Selector({ label, value, onChange, options, labels = {}, testId }) {
    return (
        <div>
            <label className="text-xs text-white/60">{label}</label>
            <div className="mt-1 flex flex-wrap gap-1.5" data-testid={testId}>
                {options.map((opt) => (
                    <button
                        key={opt}
                        type="button"
                        onClick={() => onChange(value === opt ? "" : opt)}
                        data-testid={`${testId}-${opt}`}
                        className={`rounded-full border px-2.5 py-1 text-[11px] font-semibold transition-colors ${
                            value === opt
                                ? "border-magenta/60 bg-magenta/25 text-white"
                                : "border-white/10 bg-white/[0.03] text-white/60 hover:text-white"
                        }`}
                    >
                        {labels[opt] || opt}
                    </button>
                ))}
            </div>
        </div>
    );
}

function PriceField({ label, value, onChange, testId }) {
    return (
        <div>
            <label className="text-xs text-white/60">{label}</label>
            <div className="mt-1 flex items-center gap-2 rounded-lg border border-white/10 bg-black/30 px-3">
                <input
                    type="number" min={0} max={10000}
                    value={value || 0}
                    onChange={(e) => onChange(Number(e.target.value) || 0)}
                    data-testid={testId}
                    className="flex-1 bg-transparent py-2 font-mono text-sm text-white focus:outline-none"
                />
                <span className="text-[10px] text-white/40">coins</span>
            </div>
        </div>
    );
}



function PayoutModal({ maxCoins, minCoins, onClose }) {
    const [coins, setCoins] = useState(maxCoins);
    const [err, setErr] = useState("");
    const [loading, setLoading] = useState(false);

    const submit = async (e) => {
        e.preventDefault(); setErr(""); setLoading(true);
        try {
            await api.post("/payouts/request", { coins: Number(coins) });
            onClose(true);
        } catch (e) {
            setErr(formatApiError(e.response?.data?.detail) || e.message);
        } finally { setLoading(false); }
    };

    const netEur = (coins * 0.10 * 0.80).toFixed(2);

    return (
        <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/80 backdrop-blur p-4">
            <form onSubmit={submit} className="w-full max-w-md rounded-2xl border border-white/10 bg-surface p-6">
                <div className="flex items-center justify-between">
                    <h3 className="font-display text-xl font-bold">Demande de retrait</h3>
                    <button type="button" onClick={() => onClose(false)} data-testid="payout-close" className="rounded-full p-1 text-white/50 hover:bg-white/5 hover:text-white"><X size={16} /></button>
                </div>
                <p className="mt-2 text-xs text-white/50">
                    Nous te reverserons 80 % de la valeur en euros. Le traitement prend 3 à 5 jours ouvrés.
                </p>
                <div className="mt-4 space-y-3">
                    <input type="number" min={minCoins} max={maxCoins} value={coins}
                           onChange={e => setCoins(e.target.value)}
                           className="input-base text-2xl font-mono" data-testid="payout-coins" />
                    <div className="rounded-xl border border-magenta/20 bg-magenta/5 p-3 text-center">
                        <div className="overline">Tu recevras</div>
                        <div className="mt-1 font-mono text-2xl font-bold text-magenta-200">{netEur} €</div>
                    </div>
                    {err && <div className="rounded-lg border border-red-500/30 bg-red-500/10 p-3 text-sm text-red-300">{err}</div>}
                    <button type="submit" disabled={loading || coins < minCoins || coins > maxCoins}
                            className="btn-primary w-full justify-center" data-testid="payout-submit">
                        {loading ? "Envoi…" : "Confirmer le retrait"}
                    </button>
                </div>
            </form>
        </div>
    );
}

function AddContentModal({ onClose }) {
    const [form, setForm] = useState({ title: "", description: "", media_url: "", is_premium: true, unlock_price: 0, included_in_subscription: true, schedule: false, scheduled_at: "", is_24h: false });
    const [err, setErr] = useState("");
    const [loading, setLoading] = useState(false);

    const submit = async (e) => {
        e.preventDefault(); setErr(""); setLoading(true);
        try {
            const payload = {
                title: form.title,
                description: form.description,
                media_url: form.media_url,
                is_premium: form.is_premium,
                unlock_price: Number(form.unlock_price) || 0,
                included_in_subscription: form.included_in_subscription,
            };
            if (form.schedule && form.scheduled_at) {
                const d = new Date(form.scheduled_at);
                if (isNaN(d.getTime())) { setErr("Date de planification invalide"); setLoading(false); return; }
                payload.scheduled_at = d.toISOString();
            }
            if (form.is_24h) {
                payload.expires_in_hours = 24;
            }
            await api.post("/creators/me/content", payload);
            onClose();
        } catch (e) {
            setErr(formatApiError(e.response?.data?.detail) || e.message);
        } finally { setLoading(false); }
    };

    return (
        <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/80 backdrop-blur p-4">
            <form onSubmit={submit} className="w-full max-w-lg rounded-2xl border border-white/10 bg-surface p-6 max-h-[90vh] overflow-y-auto">
                <div className="flex items-center justify-between">
                    <h3 className="font-display text-xl font-bold">Nouveau contenu</h3>
                    <button type="button" onClick={onClose} data-testid="add-content-close" className="rounded-full p-1 text-white/50 hover:bg-white/5 hover:text-white"><X size={16} /></button>
                </div>
                <div className="mt-4 space-y-3">
                    <input className="input-base" required placeholder="Titre" value={form.title} onChange={e => setForm({ ...form, title: e.target.value })} data-testid="content-title" />
                    <input className="input-base" placeholder="Description (optionnel)" value={form.description} onChange={e => setForm({ ...form, description: e.target.value })} data-testid="content-description" />
                    <FileUploader value={form.media_url} onChange={(url) => setForm({ ...form, media_url: url })} label="Téléverser une photo ou vidéo" testId="content-uploader" />
                    <input className="input-base text-xs" placeholder="…ou colle une URL existante" value={form.media_url} onChange={e => setForm({ ...form, media_url: e.target.value })} data-testid="content-media" />
                    <label className="flex items-center gap-2 text-sm text-white/70">
                        <input type="checkbox" checked={form.is_premium} onChange={e => setForm({ ...form, is_premium: e.target.checked })} data-testid="content-premium" className="h-4 w-4 accent-magenta" />
                        Contenu premium (verrouillé)
                    </label>
                    {form.is_premium && (
                        <div className="space-y-3">
                            <label className="flex items-start gap-2 rounded-lg border border-magenta/20 bg-magenta/5 p-3 text-sm text-white/80">
                                <input type="checkbox" checked={form.included_in_subscription}
                                       onChange={e => setForm({ ...form, included_in_subscription: e.target.checked })}
                                       data-testid="content-included-sub"
                                       className="mt-0.5 h-4 w-4 accent-magenta" />
                                <span className="leading-snug">
                                    Compris dans l'abonnement
                                    <span className="block text-[11px] text-white/50">
                                        {form.included_in_subscription
                                            ? "Accessible gratuitement à tes abonnés. Les non-abonnés doivent s'abonner ou payer."
                                            : "Contenu pay-per-view : même tes abonnés devront payer le prix unitaire pour y accéder."}
                                    </span>
                                </span>
                            </label>
                            <div>
                                <label className="text-xs text-white/60">Prix unitaire (€ — 0 = abonnés uniquement). Converti automatiquement en coins × 10.</label>
                                <input className="input-base mt-1" type="number" min="0" step="0.01" value={form.unlock_price} onChange={e => setForm({ ...form, unlock_price: e.target.value })} data-testid="content-price" />
                            </div>
                        </div>
                    )}

                    <div className="space-y-3 rounded-xl border border-white/10 bg-white/[0.02] p-3">
                        <label className="flex items-start gap-2 text-sm text-white/80">
                            <input type="checkbox" checked={form.schedule}
                                   onChange={e => setForm({ ...form, schedule: e.target.checked })}
                                   data-testid="content-schedule-toggle"
                                   className="mt-0.5 h-4 w-4 accent-magenta" />
                            <span>
                                Planifier la publication
                                <span className="block text-[11px] text-white/50">Le post ne sera visible qu'à partir de la date choisie.</span>
                            </span>
                        </label>
                        {form.schedule && (
                            <input type="datetime-local"
                                   min={new Date(Date.now() + 5 * 60000).toISOString().slice(0, 16)}
                                   className="input-base font-mono text-sm"
                                   value={form.scheduled_at}
                                   onChange={e => setForm({ ...form, scheduled_at: e.target.value })}
                                   data-testid="content-scheduled-at" />
                        )}
                        <label className="flex items-start gap-2 text-sm text-white/80 border-t border-white/5 pt-3">
                            <input type="checkbox" checked={form.is_24h}
                                   onChange={e => setForm({ ...form, is_24h: e.target.checked })}
                                   data-testid="content-24h-toggle"
                                   className="mt-0.5 h-4 w-4 accent-magenta" />
                            <span>
                                Expire dans 24 heures
                                <span className="block text-[11px] text-white/50">Le post disparaît automatiquement après 24h (FOMO / urgence).</span>
                            </span>
                        </label>
                    </div>

                    {err && <div className="rounded-lg border border-red-500/30 bg-red-500/10 p-3 text-sm text-red-300">{err}</div>}
                    <button type="submit" disabled={loading || !form.media_url} className="btn-primary w-full justify-center" data-testid="content-submit">
                        {loading ? "Publication..." : "Publier"}
                    </button>
                </div>
            </form>
        </div>
    );
}

function AddStoryModal({ onClose }) {
    const [media, setMedia] = useState("");
    const [caption, setCaption] = useState("");
    const [loading, setLoading] = useState(false);
    const [err, setErr] = useState("");

    const submit = async (e) => {
        e.preventDefault(); setErr(""); setLoading(true);
        try {
            await api.post("/stories", { media_url: media, caption });
            onClose();
        } catch (e) {
            setErr(formatApiError(e.response?.data?.detail) || e.message);
        } finally { setLoading(false); }
    };

    return (
        <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/80 backdrop-blur p-4">
            <form onSubmit={submit} className="w-full max-w-md rounded-2xl border border-white/10 bg-surface p-6">
                <div className="flex items-center justify-between">
                    <h3 className="font-display text-xl font-bold">Nouvelle story</h3>
                    <button type="button" onClick={onClose} data-testid="add-story-close" className="rounded-full p-1 text-white/50 hover:bg-white/5 hover:text-white"><X size={16} /></button>
                </div>
                <p className="mt-2 text-xs text-white/50">Visible 24h sur le feed.</p>
                <div className="mt-4 space-y-3">
                    <FileUploader value={media} onChange={setMedia} label="Photo ou vidéo (24h)" testId="story-uploader" />
                    <input className="input-base" placeholder="Légende (optionnelle)" value={caption} onChange={e => setCaption(e.target.value)} data-testid="story-caption" />
                    {err && <div className="rounded-lg border border-red-500/30 bg-red-500/10 p-3 text-sm text-red-300">{err}</div>}
                    <button type="submit" disabled={loading || !media} className="btn-primary w-full justify-center" data-testid="story-submit">
                        {loading ? "Publication..." : "Publier la story"}
                    </button>
                </div>
            </form>
        </div>
    );
}


function StripeConnectCard() {
    const [status, setStatus] = useState(null);
    const [loading, setLoading] = useState(true);
    const [busy, setBusy] = useState(false);
    const [err, setErr] = useState("");

    const load = async () => {
        try {
            const { data } = await api.get("/creators/me/stripe-connect/status");
            setStatus(data);
            return data;
        } catch (e) {
            setErr(formatApiError(e.response?.data?.detail) || e.message);
        } finally { setLoading(false); }
    };

    useEffect(() => { load(); }, []);

    // When the user returns from Stripe onboarding (URL contains ?stripe_connect=return),
    // refresh the status so the UI reflects the new state (charges_enabled, etc.) and
    // the "Mon dashboard Stripe" button appears.
    useEffect(() => {
        if (typeof window === "undefined") return;
        const sp = new URLSearchParams(window.location.search);
        if (sp.get("stripe_connect") === "return") {
            load();
            // Clean the URL so subsequent refreshes don't re-trigger
            const clean = window.location.pathname;
            window.history.replaceState({}, "", clean);
        }
    }, []);

    const onboard = async () => {
        setBusy(true); setErr("");
        try {
            const returnUrl = `${window.location.origin}/dashboard?stripe_connect=return`;
            const { data } = await api.post("/creators/me/stripe-connect/onboard", {
                return_url: returnUrl,
                refresh_url: returnUrl,
            });
            if (data?.url) window.location.href = data.url;
        } catch (e) {
            setErr(formatApiError(e.response?.data?.detail) || e.message);
            setBusy(false);
        }
    };

    const dashboardLink = async () => {
        setBusy(true); setErr("");
        try {
            const { data } = await api.post("/creators/me/stripe-connect/dashboard-link");
            if (!data?.url) {
                setErr("Lien Stripe indisponible, réessaie plus tard.");
                return;
            }
            // Try new tab first; if blocked (popup blocker), fallback to same tab navigation
            const popup = window.open(data.url, "_blank", "noopener,noreferrer");
            if (!popup || popup.closed || typeof popup.closed === "undefined") {
                window.location.href = data.url;
            }
        } catch (e) {
            setErr(formatApiError(e.response?.data?.detail) || e.message);
        } finally { setBusy(false); }
    };

    if (loading) {
        return <div className="mt-8 surface-card text-sm text-white/40" data-testid="stripe-connect-loading">Chargement Stripe Connect…</div>;
    }

    const isReady = status?.charges_enabled && status?.payouts_enabled;
    const inProgress = status?.connected && !isReady;

    return (
        <div className="mt-8 surface-card border-magenta/20" data-testid="stripe-connect-card">
            <div className="flex flex-col gap-4 md:flex-row md:items-start md:justify-between">
                <div className="min-w-0">
                    <div className="overline flex items-center gap-2">
                        <CreditCard size={12} /> Paiements Stripe Connect
                    </div>
                    <div className="mt-2 font-display text-xl font-bold sm:text-2xl">
                        {isReady ? (
                            <span className="flex items-center gap-2"><CheckCircle2 size={20} className="text-green-400" /> Paiements directs activés</span>
                        ) : inProgress ? (
                            <span className="flex items-center gap-2"><AlertTriangle size={20} className="text-amber-300" /> Onboarding en cours</span>
                        ) : (
                            "Reçois 80% directement sur ton Stripe"
                        )}
                    </div>
                    <div className="mt-1 text-sm text-white/60">
                        {isReady
                            ? "Chaque abonnement Stripe de tes fans arrive directement sur ton compte Stripe (20% de commission plateforme)."
                            : inProgress
                                ? "Il te reste quelques infos à compléter côté Stripe pour activer tes paiements."
                                : "Active Stripe Connect pour recevoir tes gains (80%) directement sur ton compte bancaire via Stripe — versements quasi-instantanés."}
                    </div>
                    {status?.requirements_due?.length > 0 && (
                        <div className="mt-3 rounded-lg border border-amber-500/30 bg-amber-500/5 p-3 text-xs text-amber-200" data-testid="stripe-connect-requirements">
                            <div className="font-semibold">À compléter chez Stripe :</div>
                            <ul className="mt-1 list-disc pl-4">
                                {status.requirements_due.slice(0, 5).map((r, i) => (
                                    <li key={i} className="capitalize">{r.replace(/_/g, " ")}</li>
                                ))}
                            </ul>
                        </div>
                    )}
                </div>
                <div className="flex flex-col gap-2 shrink-0">
                    {!status?.connected && (
                        <button onClick={onboard} disabled={busy} data-testid="stripe-connect-onboard-btn" className="btn-primary">
                            <Sparkles size={16} /> {busy ? "Redirection…" : "Activer mes paiements Stripe"}
                        </button>
                    )}
                    {inProgress && (
                        <button onClick={onboard} disabled={busy} data-testid="stripe-connect-resume-btn" className="btn-primary">
                            <ExternalLink size={16} /> {busy ? "Redirection…" : "Finir mon onboarding"}
                        </button>
                    )}
                    {isReady && (
                        <button onClick={dashboardLink} disabled={busy} data-testid="stripe-connect-dashboard-btn" className="btn-ghost">
                            <ExternalLink size={16} /> {busy ? "…" : "Mon dashboard Stripe"}
                        </button>
                    )}
                </div>
            </div>
            {err && <div className="mt-3 rounded-lg border border-red-500/30 bg-red-500/10 p-3 text-sm text-red-300" data-testid="stripe-connect-error">{err}</div>}
            <p className="mt-3 text-[11px] text-white/40">
                Alternative : gère ton IBAN classique depuis <Link to="/bank" className="underline hover:text-white">Compte bancaire</Link> — délais 3-5 jours.
            </p>
        </div>
    );
}
