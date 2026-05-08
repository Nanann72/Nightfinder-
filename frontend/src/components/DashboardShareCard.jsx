import { useEffect, useState } from "react";
import { api } from "@/lib/api";
import { useAuth } from "@/lib/auth";
import { toast } from "sonner";
import {
    Link as LinkIcon, Copy, Check, QrCode, Download, Share2,
    Sparkles, Image as ImageIcon, X, Loader2, Trash2, Wand2
} from "lucide-react";

const STYLES = [
    { id: "apple",   label: "Apple sombre",  desc: "Noir profond, gros titre blanc, accent magenta" },
    { id: "glamour", label: "Glamour magenta", desc: "Dégradé magenta, typographie élégante" },
    { id: "white",   label: "Minimal blanc", desc: "Blanc pur, contrastes nets, accent magenta" },
];

/**
 * Dashboard widget combining:
 *  - Shareable short link (/c/<handle>) with copy + QR code
 *  - AI flyer generator (Gemini Nano Banana) with phrase + optional photo
 *  - History of last 12 generated flyers
 */
export default function DashboardShareCard() {
    const { user } = useAuth();
    const [creator, setCreator] = useState(null);
    const [copied, setCopied] = useState(false);
    const [showQR, setShowQR] = useState(false);

    // Flyer state
    const [phrase, setPhrase] = useState("");
    const [style, setStyle] = useState("apple");
    const [photoFile, setPhotoFile] = useState(null);
    const [photoPreview, setPhotoPreview] = useState(null);
    const [generating, setGenerating] = useState(false);
    const [genResult, setGenResult] = useState(null);
    const [history, setHistory] = useState([]);

    useEffect(() => {
        (async () => {
            try {
                const { data } = await api.get(`/creators/${user.user_id}`);
                setCreator(data);
            } catch {}
            try {
                const { data } = await api.get("/creators/me/flyers");
                setHistory(data.items || []);
            } catch {}
        })();
    }, [user]);

    const handle = creator?.handle || "";
    const origin = (typeof window !== "undefined" ? window.location.origin : "https://meandyou.fans").replace(/\/$/, "");
    const shortUrl = handle ? `${origin}/c/${handle}` : "";
    const qrUrl = handle
        ? `https://api.qrserver.com/v1/create-qr-code/?size=300x300&margin=10&data=${encodeURIComponent(shortUrl)}&color=ffffff&bgcolor=000000`
        : "";

    const onCopy = async () => {
        try {
            await navigator.clipboard.writeText(shortUrl);
            setCopied(true);
            toast.success("Lien copié ✓");
            setTimeout(() => setCopied(false), 1800);
        } catch {
            toast.error("Copie indisponible — sélectionne et copie manuellement.");
        }
    };

    const onNativeShare = async () => {
        if (typeof navigator === "undefined" || !navigator.share) return onCopy();
        try {
            await navigator.share({
                title: `${creator?.display_name || "Mon profil"} sur me&you.fans`,
                text: "Découvre mon contenu exclusif 💎",
                url: shortUrl,
            });
        } catch {}
    };

    const onPickPhoto = (e) => {
        const f = e.target.files?.[0];
        if (!f) return;
        if (f.size > 8 * 1024 * 1024) {
            toast.error("Photo trop lourde (max 8 Mo)");
            return;
        }
        setPhotoFile(f);
        const reader = new FileReader();
        reader.onload = (ev) => setPhotoPreview(ev.target.result);
        reader.readAsDataURL(f);
    };

    const generate = async () => {
        if (phrase.trim().length < 2) {
            toast.error("Écris une phrase d'au moins 2 caractères.");
            return;
        }
        setGenerating(true); setGenResult(null);
        try {
            const fd = new FormData();
            fd.append("phrase", phrase.trim());
            fd.append("style", style);
            if (photoFile) fd.append("photo", photoFile);
            const { data } = await api.post("/creators/me/flyer", fd, {
                headers: { "Content-Type": "multipart/form-data" },
                timeout: 120000,
            });
            setGenResult(data);
            setHistory(h => [data, ...h].slice(0, 12));
            if (data.emailed) {
                toast.success("Flyer généré ✨ + envoyé sur ton email");
            } else {
                toast.success("Flyer généré ✨");
            }
        } catch (e) {
            toast.error(e.response?.data?.detail || "Erreur génération IA");
        } finally {
            setGenerating(false);
        }
    };

    const downloadFlyer = (url, filename) => {
        const a = document.createElement("a");
        a.href = url;
        a.download = filename || "flyer.png";
        a.target = "_blank";
        document.body.appendChild(a); a.click(); a.remove();
    };

    const deleteFlyer = async (flyerId) => {
        if (!window.confirm("Supprimer ce flyer ?")) return;
        try {
            await api.delete(`/creators/me/flyers/${flyerId}`);
            setHistory(h => h.filter(f => f.flyer_id !== flyerId));
            toast.success("Supprimé");
        } catch (e) { toast.error("Erreur"); }
    };

    if (!creator) return null;

    return (
        <section className="space-y-6" data-testid="dashboard-share-card">
            {/* === SHARE LINK === */}
            <div className="surface-card">
                <div className="flex items-start justify-between gap-3">
                    <div>
                        <div className="overline flex items-center gap-1.5"><LinkIcon size={11} /> Mon lien à partager</div>
                        <h2 className="mt-2 font-display text-xl font-bold sm:text-2xl">Diffuse ton profil partout</h2>
                        <p className="mt-1 text-sm text-white/55">
                            Mets ce lien court dans ta bio Insta, TikTok, Twitter ou OnlyFans.
                        </p>
                    </div>
                </div>

                <div className="mt-5 flex flex-col gap-3 sm:flex-row sm:items-stretch">
                    <div className="flex-1 flex items-center gap-2 rounded-2xl border border-white/[0.08] bg-white/[0.03] px-4 py-3">
                        <LinkIcon size={14} className="text-white/40 shrink-0" />
                        <code data-testid="share-shortlink" className="flex-1 truncate font-mono text-sm text-white">
                            {shortUrl}
                        </code>
                    </div>
                    <button
                        onClick={onCopy}
                        data-testid="share-copy-btn"
                        className="btn-primary justify-center"
                    >
                        {copied ? <Check size={14} /> : <Copy size={14} />}
                        {copied ? "Copié" : "Copier"}
                    </button>
                    <button
                        onClick={() => setShowQR(s => !s)}
                        data-testid="share-qr-btn"
                        className="btn-ghost justify-center"
                        aria-pressed={showQR}
                    >
                        <QrCode size={14} /> QR
                    </button>
                    <button
                        onClick={onNativeShare}
                        data-testid="share-native-btn"
                        className="btn-ghost justify-center"
                    >
                        <Share2 size={14} /> Partager
                    </button>
                </div>

                {showQR && (
                    <div className="mt-5 flex flex-col items-center gap-3 rounded-3xl border border-white/[0.06] bg-black p-6" data-testid="share-qr-panel">
                        <img src={qrUrl} alt="QR code" className="h-48 w-48 rounded-2xl border border-white/10" />
                        <div className="text-xs text-white/55">Scanne avec ton téléphone</div>
                        <button
                            onClick={() => downloadFlyer(qrUrl, `qr-${handle}.png`)}
                            className="btn-ghost"
                            data-testid="share-qr-download"
                        >
                            <Download size={13} /> Télécharger le QR
                        </button>
                    </div>
                )}
            </div>

            {/* === AI FLYER GENERATOR === */}
            <div className="surface-card">
                <div className="flex items-start gap-3">
                    <div className="flex h-10 w-10 shrink-0 items-center justify-center rounded-2xl border border-magenta/30 bg-magenta/10 text-magenta-200">
                        <Wand2 size={18} />
                    </div>
                    <div>
                        <div className="overline">IA · Nano Banana</div>
                        <h2 className="mt-1 font-display text-xl font-bold sm:text-2xl">
                            Crée ton flyer en 1 clic
                        </h2>
                        <p className="mt-1 text-sm text-white/55">
                            Tape une phrase accrocheuse, ajoute (optionnel) une photo de toi, choisis un style. L'IA génère un poster prêt pour Insta.
                        </p>
                    </div>
                </div>

                {/* Form */}
                <div className="mt-6 space-y-4">
                    <div>
                        <label className="text-xs text-white/55">Ta phrase d'accroche</label>
                        <textarea
                            value={phrase}
                            onChange={(e) => setPhrase(e.target.value)}
                            data-testid="flyer-phrase"
                            placeholder="Ex : « Mon contenu fitness exclusif est en ligne ✨ »"
                            maxLength={200}
                            rows={2}
                            className="input-base mt-1.5 resize-none"
                        />
                        <div className="mt-1 text-right text-[11px] text-white/35">{phrase.length} / 200</div>
                    </div>

                    {/* Style picker */}
                    <div>
                        <label className="text-xs text-white/55">Style</label>
                        <div className="mt-1.5 grid gap-2 sm:grid-cols-3">
                            {STYLES.map(s => (
                                <button
                                    type="button"
                                    key={s.id}
                                    onClick={() => setStyle(s.id)}
                                    data-testid={`flyer-style-${s.id}`}
                                    className={`text-left rounded-2xl border p-3 transition-all active:scale-[0.98] ${
                                        style === s.id
                                            ? "border-magenta bg-magenta/10"
                                            : "border-white/[0.08] bg-white/[0.02] hover:border-white/20"
                                    }`}
                                >
                                    <div className="text-sm font-semibold text-white">{s.label}</div>
                                    <div className="mt-0.5 text-[11px] text-white/50 leading-snug">{s.desc}</div>
                                </button>
                            ))}
                        </div>
                    </div>

                    {/* Optional photo */}
                    <div>
                        <label className="text-xs text-white/55">Photo de toi (optionnelle)</label>
                        <div className="mt-1.5 flex items-center gap-3">
                            {photoPreview ? (
                                <div className="relative shrink-0">
                                    <img src={photoPreview} alt="" className="h-20 w-20 rounded-2xl border border-white/10 object-cover" />
                                    <button
                                        type="button"
                                        onClick={() => { setPhotoFile(null); setPhotoPreview(null); }}
                                        data-testid="flyer-photo-remove"
                                        className="absolute -top-1.5 -right-1.5 flex h-6 w-6 items-center justify-center rounded-full border border-white/15 bg-black text-white/80 hover:bg-red-500/80"
                                        aria-label="Retirer"
                                    >
                                        <X size={12} />
                                    </button>
                                </div>
                            ) : (
                                <label
                                    data-testid="flyer-photo-upload"
                                    className="flex h-20 w-20 cursor-pointer flex-col items-center justify-center gap-1 rounded-2xl border border-dashed border-white/15 bg-white/[0.02] text-white/55 hover:border-magenta/40 hover:text-white transition-colors"
                                >
                                    <ImageIcon size={18} />
                                    <span className="text-[10px]">Photo</span>
                                    <input type="file" accept="image/*" onChange={onPickPhoto} className="hidden" />
                                </label>
                            )}
                            <div className="flex-1 text-xs text-white/45 leading-relaxed">
                                Ajoute une photo claire de toi pour que l'IA l'intègre dans le flyer.
                                Si tu ne mets rien, le flyer sera typographique.
                            </div>
                        </div>
                    </div>

                    <button
                        onClick={generate}
                        disabled={generating || phrase.trim().length < 2}
                        data-testid="flyer-generate-btn"
                        className="btn-primary-magenta w-full justify-center disabled:opacity-40 disabled:cursor-not-allowed"
                    >
                        {generating ? (
                            <><Loader2 size={14} className="animate-spin" /> Génération en cours…</>
                        ) : (
                            <><Sparkles size={14} /> Générer mon flyer</>
                        )}
                    </button>
                </div>

                {/* Result */}
                {genResult && (
                    <div className="mt-6 rounded-3xl border border-magenta/30 bg-gradient-to-br from-magenta/10 to-transparent p-5" data-testid="flyer-result">
                        <div className="overline mb-3 flex items-center gap-2">
                            <span>Ton flyer · prêt à partager</span>
                            {genResult.emailed && (
                                <span data-testid="flyer-emailed-badge"
                                      className="inline-flex items-center gap-1 rounded-full border border-emerald-500/40 bg-emerald-500/10 px-2 py-0.5 text-[10px] font-semibold text-emerald-300 normal-case tracking-normal">
                                    <Check size={10} /> Envoyé par email
                                </span>
                            )}
                        </div>
                        <div className="flex flex-col gap-4 sm:flex-row">
                            <img
                                src={genResult.url}
                                alt="Flyer généré"
                                className="w-full max-w-[260px] rounded-2xl border border-white/10 shadow-2xl"
                            />
                            <div className="flex-1 space-y-2">
                                <button
                                    onClick={() => downloadFlyer(genResult.url, genResult.filename)}
                                    data-testid="flyer-download-btn"
                                    className="btn-primary w-full justify-center"
                                >
                                    <Download size={14} /> Télécharger
                                </button>
                                <button
                                    onClick={onCopy}
                                    className="btn-ghost w-full justify-center"
                                >
                                    <Copy size={14} /> Copier mon lien
                                </button>
                                <p className="text-[11px] text-white/45 leading-relaxed pt-2">
                                    Partage le flyer sur Insta/TikTok avec ton lien {origin}/c/{handle} en bio.
                                </p>
                            </div>
                        </div>
                    </div>
                )}

                {/* History */}
                {history.length > 0 && (
                    <div className="mt-6">
                        <div className="overline mb-3">Tes derniers flyers</div>
                        <div className="grid grid-cols-3 gap-2 sm:grid-cols-4 lg:grid-cols-6">
                            {history.map(h => (
                                <div key={h.flyer_id} data-testid={`flyer-history-${h.flyer_id}`}
                                     className="group relative aspect-[4/5] overflow-hidden rounded-xl border border-white/[0.08]">
                                    <img src={h.url} alt={h.phrase} className="h-full w-full object-cover transition-transform group-hover:scale-105" />
                                    <div className="absolute inset-0 bg-gradient-to-t from-black/85 via-black/0 to-transparent opacity-0 group-hover:opacity-100 transition-opacity" />
                                    <div className="absolute bottom-0 left-0 right-0 flex items-center gap-1 p-2 opacity-0 group-hover:opacity-100 transition-opacity">
                                        <button
                                            onClick={() => downloadFlyer(h.url, h.filename)}
                                            className="flex-1 flex items-center justify-center rounded-lg bg-white/15 backdrop-blur p-1.5 text-white hover:bg-white/25 transition-colors"
                                            aria-label="Télécharger"
                                        >
                                            <Download size={12} />
                                        </button>
                                        <button
                                            onClick={() => deleteFlyer(h.flyer_id)}
                                            className="flex items-center justify-center rounded-lg bg-red-500/40 backdrop-blur p-1.5 text-white hover:bg-red-500/60 transition-colors"
                                            aria-label="Supprimer"
                                        >
                                            <Trash2 size={12} />
                                        </button>
                                    </div>
                                </div>
                            ))}
                        </div>
                    </div>
                )}
            </div>
        </section>
    );
}
