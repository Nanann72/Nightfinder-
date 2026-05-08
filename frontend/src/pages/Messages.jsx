import { useEffect, useState, useRef, useCallback } from "react";
import { useSearchParams, Link } from "react-router-dom";
import { useTranslation } from "react-i18next";
import { api } from "@/lib/api";
import { useAuth } from "@/lib/auth";
import { refreshWallet } from "@/components/WalletChip";
import FileUploader from "@/components/FileUploader";
import WatermarkedMedia from "@/components/WatermarkedMedia";
import VoiceRecorder from "@/components/VoiceRecorder";
import VoicePlayer from "@/components/VoicePlayer";
import { Send, Search, Zap, Lock, Coins, Paperclip, X, Mic } from "lucide-react";

export default function Messages() {
    const { user } = useAuth();
    const { t } = useTranslation();
    const [params, setParams] = useSearchParams();
    const [threads, setThreads] = useState([]);
    const [active, setActive] = useState(null); // { creator_id, fan_id }
    const [messages, setMessages] = useState([]);
    const [body, setBody] = useState("");
    const [partner, setPartner] = useState(null);
    const [creatorInfo, setCreatorInfo] = useState(null);
    const [mediaOpen, setMediaOpen] = useState(false);
    const [mediaUrl, setMediaUrl] = useState("");
    const [mediaPaywall, setMediaPaywall] = useState(0);
    const [voiceUrl, setVoiceUrl] = useState("");
    const [voiceDuration, setVoiceDuration] = useState(0);
    const [err, setErr] = useState("");
    const feedRef = useRef(null);

    const loadThreads = useCallback(async () => {
        try {
            const { data } = await api.get("/messages/threads");
            setThreads(data);
        } catch {}
    }, []);

    useEffect(() => { loadThreads(); }, [loadThreads]);

    // Initialise active thread from URL
    useEffect(() => {
        const cid = params.get("creator");
        const fid = params.get("fan");
        if (cid) {
            // If user is the creator and no fan_id provided, leave to user to pick from list
            if (user && user.user_id === cid && !fid) return;
            setActive({ creator_id: cid, fan_id: fid || (user ? user.user_id : null) });
        }
    }, [params, user]);

    const loadThread = useCallback(async () => {
        if (!active?.creator_id || !active?.fan_id) return;
        try {
            const isCreator = user?.user_id === active.creator_id;
            const url = `/messages/${active.creator_id}` + (isCreator ? `?fan_id=${active.fan_id}` : "");
            const { data } = await api.get(url);
            setMessages(data);
            // Load creator info for header
            const cr = await api.get(`/creators/${active.creator_id}`);
            setCreatorInfo(cr.data);
            // If creator is viewing, load fan info as partner
            if (isCreator && active.fan_id) {
                const t = threads.find(t => t.creator_id === active.creator_id && t.fan_id === active.fan_id);
                setPartner(t?.partner || null);
            } else {
                setPartner(null);
            }
        } catch {}
    }, [active, user, threads]);

    useEffect(() => { loadThread(); }, [loadThread]);

    useEffect(() => {
        if (feedRef.current) feedRef.current.scrollTop = feedRef.current.scrollHeight;
    }, [messages]);

    const send = async (e, priority = false) => {
        e.preventDefault();
        const isVoice = !!voiceUrl;
        if ((!body.trim() && !mediaUrl && !isVoice) || !active) return;
        const isCreator = user?.user_id === active.creator_id;
        const msgBody = body; const mUrl = mediaUrl; const mPay = mediaPaywall;
        const vUrl = voiceUrl; const vDur = voiceDuration;
        setBody(""); setMediaUrl(""); setMediaPaywall(0); setMediaOpen(false);
        setVoiceUrl(""); setVoiceDuration(0);
        try {
            if (priority && !isCreator) {
                await api.post(`/messages/${active.creator_id}/priority`, { body: msgBody });
            } else if (isVoice) {
                const payload = {
                    creator_id: active.creator_id,
                    body: msgBody,
                    kind: "voice",
                    voice_duration_seconds: vDur,
                    media_url: vUrl,
                    media_paywall_coins: isCreator ? (Number(mPay) || 0) : 0,
                    ...(isCreator ? { fan_id: active.fan_id } : {}),
                };
                await api.post("/messages", payload);
            } else {
                const payload = {
                    creator_id: active.creator_id,
                    body: msgBody,
                    ...(isCreator ? { fan_id: active.fan_id } : {}),
                    ...(mUrl ? { media_url: mUrl, media_paywall_coins: Number(mPay) || 0 } : {}),
                };
                await api.post("/messages", payload);
            }
            await loadThread();
            await loadThreads();
        } catch (err) {
            const d = err.response?.data?.detail;
            if (d?.error === "insufficient_coins") {
                setErr(`Solde insuffisant. Il te faut ${d.needed} coins (tu en as ${d.balance}).`);
            }
            setBody(msgBody); setMediaUrl(mUrl); setMediaPaywall(mPay);
            setVoiceUrl(vUrl); setVoiceDuration(vDur);
        }
    };

    const unlockMedia = async (messageId) => {
        setErr("");
        try {
            await api.post(`/messages/${messageId}/unlock`);
            refreshWallet();
            await loadThread();
        } catch (err) {
            const d = err.response?.data?.detail;
            if (d?.error === "insufficient_coins") {
                setErr(`Solde insuffisant (${d.balance}/${d.needed} coins). Recharge ton wallet.`);
            } else {
                setErr(d || "Déverrouillage impossible");
            }
        }
    };

    const headerName = partner?.name || creatorInfo?.display_name || t("messages.conversation");
    const headerAvatar = partner?.avatar_url || creatorInfo?.avatar_url;
    const headerHandle = partner ? partner.email?.split("@")[0] : creatorInfo?.handle;

    return (
        <div className="relative z-10 container-mx py-8">
            <h1 className="font-display text-3xl font-bold">{t("messages.title_full")}</h1>
            <div className="mt-6 grid gap-6 lg:grid-cols-12">
                {/* Threads list */}
                <div className="surface-card p-0 lg:col-span-4">
                    <div className="border-b border-white/5 p-4">
                        <div className="relative">
                            <Search className="absolute left-3 top-1/2 -translate-y-1/2 text-white/40" size={14} />
                            <input className="input-base py-2 pl-9 text-sm" placeholder={t("messages.search.placeholder")} data-testid="messages-search" />
                        </div>
                    </div>
                    <div className="max-h-[70vh] overflow-auto divide-y divide-white/5">
                        {threads.length === 0 && (
                            <div className="p-6 text-center text-sm text-white/40" data-testid="no-threads">
                                {t("messages.threads.empty")}
                            </div>
                        )}
                        {threads.map((thr) => {
                            const isMine = active?.creator_id === thr.creator_id && active?.fan_id === thr.fan_id;
                            const isViewedAsCreator = user?.user_id === thr.creator_id;
                            const displayName = isViewedAsCreator ? (thr.partner?.name || "Fan") : (thr.creator?.display_name || thr.partner?.name);
                            const avatar = isViewedAsCreator ? null : thr.creator?.avatar_url;
                            return (
                                <button
                                    key={`${thr.creator_id}-${thr.fan_id}`}
                                    data-testid={`thread-${thr.creator_id}-${thr.fan_id}`}
                                    onClick={() => {
                                        setActive({ creator_id: thr.creator_id, fan_id: thr.fan_id });
                                        setParams({ creator: thr.creator_id, fan: thr.fan_id });
                                    }}
                                    className={`flex w-full items-center gap-3 p-4 text-left transition-colors hover:bg-white/[0.03] ${isMine ? "bg-white/[0.04]" : ""}`}>
                                    <div className="h-11 w-11 overflow-hidden rounded-full border border-white/10 bg-surface2 flex items-center justify-center">
                                        {avatar
                                            ? <img src={avatar} alt="" className="h-full w-full object-cover" />
                                            : <span className="font-bold text-magenta-200">{displayName?.[0]?.toUpperCase() || "?"}</span>}
                                    </div>
                                    <div className="min-w-0 flex-1">
                                        <div className="truncate font-semibold flex items-center gap-2">
                                            {displayName || t("messages.user")}
                                            {isViewedAsCreator && <span className="text-[10px] uppercase tracking-widest text-magenta-400">Fan</span>}
                                        </div>
                                        <div className="truncate text-xs text-white/40">{thr.last_body}</div>
                                    </div>
                                </button>
                            );
                        })}
                    </div>
                </div>

                {/* Thread */}
                <div className="surface-card flex flex-col p-0 lg:col-span-8 min-h-[70vh]">
                    {active?.fan_id ? (
                        <>
                            <div className="flex items-center gap-3 border-b border-white/5 p-4">
                                <div className="h-10 w-10 overflow-hidden rounded-full border border-white/10 flex items-center justify-center">
                                    {headerAvatar
                                        ? <img src={headerAvatar} alt="" className="h-full w-full object-cover" />
                                        : <span className="font-bold text-magenta-200">{headerName?.[0]}</span>}
                                </div>
                                <div className="flex-1">
                                    <div className="font-semibold" data-testid="thread-title">{headerName}</div>
                                    <div className="text-xs text-white/40">@{headerHandle}</div>
                                </div>
                                {creatorInfo && user?.user_id !== creatorInfo.creator_id && (
                                    <Link to={`/createur/${creatorInfo.creator_id}`} className="text-xs text-magenta-200 hover:text-white">
                                        Voir profil →
                                    </Link>
                                )}
                            </div>

                            <div ref={feedRef} className="flex-1 space-y-3 overflow-auto p-6">
                                {messages.map(m => {
                                    const mine = m.sender_id === user?.user_id;
                                    const isTip = m.kind === "tip";
                                    const isVoice = m.kind === "voice";
                                    const isPriority = m.is_priority;
                                    const hasPaywall = (m.media_paywall_coins || 0) > 0;
                                    const locked = hasPaywall && !m.is_unlocked;
                                    return (
                                        <div key={m.message_id} className={`flex ${mine ? "justify-end" : "justify-start"}`}>
                                            <div className={`max-w-[75%] rounded-2xl px-4 py-2.5 text-sm ${
                                                isTip ? "border border-magenta/40 bg-magenta/15 text-magenta-200"
                                                    : isPriority ? "border border-amber-500/50 bg-gradient-to-br from-amber-500/20 to-amber-500/5 text-amber-100"
                                                    : mine ? "bg-magenta text-white"
                                                    : "border border-white/10 bg-white/5"}`}>
                                                {isPriority && (
                                                    <div className="mb-1 flex items-center gap-1 text-[10px] font-bold uppercase tracking-wider text-amber-300">
                                                        <Zap size={10} /> Prioritaire · {m.priority_cost || 50} coins
                                                    </div>
                                                )}
                                                {m.body}
                                                {isVoice && m.media_url && !locked && (
                                                    <div className={m.body ? "mt-2" : ""}>
                                                        <VoicePlayer
                                                            src={m.media_url}
                                                            duration={Number(m.voice_duration_seconds) || 0}
                                                            mine={mine}
                                                            testId={`dm-voice-${m.message_id}`}
                                                        />
                                                    </div>
                                                )}
                                                {!isVoice && m.media_url && !locked && (
                                                    <div className="mt-2">
                                                        <WatermarkedMedia
                                                            src={m.media_url}
                                                            watermark={hasPaywall && !mine}
                                                            testId={`dm-media-${m.message_id}`}
                                                        />
                                                    </div>
                                                )}
                                                {locked && (
                                                    <div className="mt-2 relative overflow-hidden rounded-xl border border-magenta/30 bg-gradient-to-br from-magenta/20 to-obsidian p-8 text-center" data-testid={`locked-media-${m.message_id}`}>
                                                        <div className="absolute inset-0 backdrop-blur-xl" />
                                                        <div className="relative flex flex-col items-center gap-2">
                                                            <Lock size={24} className="text-magenta-200" />
                                                            <div className="font-semibold text-white">
                                                                {isVoice ? "Vocal verrouillé" : "Média verrouillé"}
                                                            </div>
                                                            {isVoice && m.voice_duration_seconds && (
                                                                <div className="text-[11px] text-white/60">~{m.voice_duration_seconds}s</div>
                                                            )}
                                                            <button
                                                                onClick={() => unlockMedia(m.message_id)}
                                                                data-testid={`unlock-media-${m.message_id}`}
                                                                className="inline-flex items-center gap-1 rounded-full border border-magenta/40 bg-magenta/20 px-3 py-1.5 text-xs font-semibold text-white hover:bg-magenta/30"
                                                            >
                                                                <Coins size={12} /> Déverrouiller · {m.media_paywall_coins}
                                                            </button>
                                                        </div>
                                                    </div>
                                                )}
                                                {hasPaywall && mine && (
                                                    <div className="mt-1 flex items-center gap-1 text-[10px] text-white/70">
                                                        <Coins size={10} /> Paywall : {m.media_paywall_coins} coins
                                                    </div>
                                                )}
                                            </div>
                                        </div>
                                    );
                                })}
                                {messages.length === 0 && (
                                    <div className="py-12 text-center text-sm text-white/40" data-testid="empty-thread">
                                        {user?.user_id === active.creator_id
                                            ? "Aucun message dans cette conversation."
                                            : `Dis bonjour à ${headerName} ✨`}
                                    </div>
                                )}
                            </div>

                            <form onSubmit={send} className="border-t border-white/5 p-4">
                                {err && <div className="mb-2 rounded-lg border border-red-500/30 bg-red-500/10 p-2 text-xs text-red-300" data-testid="messages-error">{err}</div>}
                                {voiceUrl && (
                                    <div className="mb-3 flex flex-col gap-2 rounded-xl border border-magenta/30 bg-magenta/5 p-3" data-testid="voice-attachment">
                                        <div className="flex items-center gap-2">
                                            <span className="inline-flex items-center gap-1 text-[11px] font-semibold uppercase tracking-wider text-magenta-200">
                                                <Mic size={11} /> Vocal · {voiceDuration}s
                                            </span>
                                            <button
                                                type="button"
                                                onClick={() => { setVoiceUrl(""); setVoiceDuration(0); }}
                                                data-testid="voice-attachment-remove"
                                                className="ml-auto rounded-full p-1 text-white/60 hover:bg-white/5"
                                            >
                                                <X size={13} />
                                            </button>
                                        </div>
                                        <audio src={voiceUrl} controls className="h-9 w-full" />
                                        {user?.user_id === active.creator_id && (
                                            <div className="flex items-center gap-1.5">
                                                <Coins size={11} className="text-magenta-200" />
                                                <input
                                                    type="number" min={0} max={10000}
                                                    value={mediaPaywall}
                                                    onChange={e => setMediaPaywall(Number(e.target.value))}
                                                    className="w-20 rounded border border-white/10 bg-white/5 px-2 py-0.5 text-xs font-mono"
                                                    data-testid="voice-paywall-input"
                                                />
                                                <span className="text-[11px] text-white/50">coins (0 = gratuit)</span>
                                            </div>
                                        )}
                                    </div>
                                )}
                                {mediaUrl && (
                                    <div className="mb-3 flex items-center gap-3 rounded-xl border border-magenta/30 bg-magenta/5 p-2">
                                        <div className="h-12 w-12 shrink-0 overflow-hidden rounded-lg border border-white/10 bg-black">
                                            {/\.(mp4|webm|mov)(\?|$)/i.test(mediaUrl)
                                                ? <video src={mediaUrl} className="h-full w-full object-cover" />
                                                : <img src={mediaUrl} alt="" className="h-full w-full object-cover" />}
                                        </div>
                                        <div className="flex-1 min-w-0">
                                            <div className="text-xs text-white/70 truncate">Média joint</div>
                                            {user?.user_id === active.creator_id && (
                                                <div className="mt-1 flex items-center gap-1.5">
                                                    <Coins size={11} className="text-magenta-200" />
                                                    <input
                                                        type="number" min={0} max={10000}
                                                        value={mediaPaywall}
                                                        onChange={e => setMediaPaywall(Number(e.target.value))}
                                                        className="w-20 rounded border border-white/10 bg-white/5 px-2 py-0.5 text-xs font-mono"
                                                        data-testid="message-media-paywall"
                                                    />
                                                    <span className="text-[11px] text-white/50">coins (0 = gratuit)</span>
                                                </div>
                                            )}
                                        </div>
                                        <button type="button" onClick={() => { setMediaUrl(""); setMediaPaywall(0); }} className="rounded-full p-1 text-white/50 hover:bg-white/5">
                                            <X size={14} />
                                        </button>
                                    </div>
                                )}
                                {mediaOpen && !mediaUrl && (
                                    <div className="mb-3">
                                        <FileUploader value="" onChange={setMediaUrl} label="Joindre une photo ou vidéo" testId="message-media-uploader" />
                                    </div>
                                )}
                                <div className="flex items-center gap-2">
                                    {user?.user_id === active.creator_id && (
                                        <button
                                            type="button"
                                            onClick={() => setMediaOpen(!mediaOpen)}
                                            data-testid="message-attach-btn"
                                            className="rounded-full border border-white/10 bg-white/[0.03] p-2 text-white/70 hover:border-magenta/40 hover:text-magenta-200"
                                            title="Joindre un média"
                                        >
                                            <Paperclip size={16} />
                                        </button>
                                    )}
                                    {!voiceUrl && (
                                        <VoiceRecorder
                                            onUploaded={(res) => {
                                                if (!res) { setVoiceUrl(""); setVoiceDuration(0); return; }
                                                setVoiceUrl(res.url);
                                                setVoiceDuration(res.duration);
                                            }}
                                            onCancel={() => { setVoiceUrl(""); setVoiceDuration(0); }}
                                        />
                                    )}
                                    <input
                                        data-testid="message-input"
                                        value={body}
                                        onChange={e => setBody(e.target.value)}
                                        placeholder={voiceUrl ? "Légende (optionnelle)…" : (user?.user_id === active.creator_id ? "Réponds à ton fan…" : "Écris un message…")}
                                        className="input-base flex-1"
                                    />
                                    <button data-testid="message-send" type="submit" className="btn-primary"><Send size={16} /></button>
                                </div>
                                {user?.user_id !== active.creator_id && (
                                    <button
                                        type="button"
                                        onClick={(e) => send(e, true)}
                                        disabled={!body.trim()}
                                        data-testid="message-send-priority"
                                        className="mt-2 inline-flex items-center gap-1.5 rounded-full border border-amber-500/30 bg-amber-500/10 px-3 py-1 text-xs text-amber-200 transition-colors hover:bg-amber-500/20 disabled:opacity-40"
                                        title="Ton message passe en tête de file + notification spéciale"
                                    >
                                        <Zap size={12} /> Envoyer en prioritaire (50 coins)
                                    </button>
                                )}
                            </form>
                        </>
                    ) : (
                        <div className="flex flex-1 items-center justify-center p-12 text-center text-white/40" data-testid="no-active-thread">
                            {t("messages.select_conversation")}
                        </div>
                    )}
                </div>
            </div>
        </div>
    );
}
