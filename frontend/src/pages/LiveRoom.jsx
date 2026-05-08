import { useEffect, useMemo, useRef, useState, useCallback } from "react";
import { useParams, useNavigate, useSearchParams, Link } from "react-router-dom";
import { api, API, tokenStore } from "@/lib/api";
import { useAuth, formatApiError } from "@/lib/auth";
import { refreshWallet } from "@/components/WalletChip";
import {
    LiveKitRoom,
    RoomAudioRenderer,
} from "@livekit/components-react";
import LiveHostControls from "@/components/LiveHostControls";
import LiveHostStage from "@/components/LiveHostStage";
import LiveViewer from "@/components/LiveViewer";
import LiveDurationTimer from "@/components/LiveDurationTimer";
import LiveChatList from "@/components/LiveChatList";
import LiveEndedRecap from "@/components/LiveEndedRecap";
import LiveModerationPanel from "@/components/LiveModerationPanel";
import TipTicker from "@/components/TipTicker";
import TipGoalBar from "@/components/TipGoalBar";
import TipMenuEditor from "@/components/TipMenuEditor";
import {
    Radio, Send, Gift, Coins, Eye, X, Zap, StopCircle, Users, Heart,
    Maximize2, Minimize2, Target, Lock, Save, Sliders, Crown,
} from "lucide-react";

export default function LiveRoom() {
    const { sessionId } = useParams();
    const [params] = useSearchParams();
    const nav = useNavigate();
    const { user } = useAuth();
    const [session, setSession] = useState(null);
    const [joinInfo, setJoinInfo] = useState(null);
    const [chat, setChat] = useState([]);
    const [msg, setMsg] = useState("");
    const [tipOpen, setTipOpen] = useState(false);
    const [tipPreset, setTipPreset] = useState(null);
    const [err, setErr] = useState("");
    const [loading, setLoading] = useState(true);
    const [joined, setJoined] = useState(false);
    const [ppvLocked, setPpvLocked] = useState(false);
    const [privateLocked, setPrivateLocked] = useState(false);
    const [privatePaying, setPrivatePaying] = useState(false);
    const [isFullscreen, setIsFullscreen] = useState(false);
    const [hostPanelOpen, setHostPanelOpen] = useState(false);
    const [goalCelebrate, setGoalCelebrate] = useState(false);
    const [topTippers, setTopTippers] = useState([]);
    const [viewerPulse, setViewerPulse] = useState(false);
    const feedRef = useRef(null);
    const pollRef = useRef(null);
    const sinceRef = useRef(null);
    const stageRef = useRef(null);
    const lastViewerCount = useRef(0);
    const isHost = params.get("host") === "1" && user?.user_id === session?.creator_id;
    const isEnded = session?.status === "ended";

    const loadSession = useCallback(async () => {
        try {
            const { data } = await api.get(`/live/${sessionId}`);
            setSession((prev) => {
                if (prev && data && !prev.goal_reached && data.goal_reached) {
                    setGoalCelebrate(true);
                    setTimeout(() => setGoalCelebrate(false), 4500);
                }
                // Pulse viewer count when it goes UP (subtle social-proof effect).
                const newVc = data.viewer_count || 0;
                if (newVc > (lastViewerCount.current || 0)) {
                    setViewerPulse(true);
                    setTimeout(() => setViewerPulse(false), 800);
                }
                lastViewerCount.current = newVc;
                return data;
            });
            if (data.status === "ended") {
                // Don't surface "live ended" as an error — the recap takes over.
                setErr("");
            } else if (data.is_ppv && data.ppv_coins > 0 && !data.has_access && user?.user_id !== data.creator_id) {
                setPpvLocked(true);
            } else if (data.private_mode && !data.has_private_access && user?.user_id !== data.creator_id) {
                setPrivateLocked(true);
            }
        } catch (e) {
            setErr(formatApiError(e.response?.data?.detail) || "Live introuvable");
        } finally { setLoading(false); }
    }, [sessionId, user]);

    // Top tippers — refreshed alongside session polling for the in-stage banner
    // and the post-stream recap podium.
    const loadTopTippers = useCallback(async () => {
        try {
            const { data } = await api.get(`/live/${sessionId}/leaderboard`);
            setTopTippers(Array.isArray(data) ? data : []);
        } catch { /* noop */ }
    }, [sessionId]);

    const payPrivate = async () => {
        setPrivatePaying(true); setErr("");
        try {
            await api.post(`/live/${sessionId}/private-pay`);
            setPrivateLocked(false);
            refreshWallet();
            await loadSession();
        } catch (e) {
            const d = e.response?.data?.detail;
            if (d?.error === "insufficient_coins") {
                setErr(`Solde insuffisant (${d.balance}/${d.needed} coins). Recharge ton wallet.`);
            } else { setErr(formatApiError(d) || e.message); }
        } finally { setPrivatePaying(false); }
    };

    const toggleFullscreen = () => {
        const el = stageRef.current;
        if (!el) return;
        // 1. Try the standard Fullscreen API (Chrome / Firefox / Safari macOS).
        const reqStd = el.requestFullscreen || el.webkitRequestFullscreen || el.msRequestFullscreen;
        const exitStd = document.exitFullscreen || document.webkitExitFullscreen || document.msExitFullscreen;
        if (document.fullscreenElement || document.webkitFullscreenElement) {
            if (exitStd) exitStd.call(document);
            setIsFullscreen(false);
            return;
        }
        if (reqStd && document.fullscreenEnabled !== false) {
            try {
                const p = reqStd.call(el);
                if (p && p.then) {
                    p.then(() => setIsFullscreen(true)).catch(() => {
                        // Browser refused — fall back to fake-fullscreen.
                        setIsFullscreen(true);
                    });
                }
                return;
            } catch { /* fall through */ }
        }
        // 2. iOS Safari has no Element.requestFullscreen — try the <video> path
        //    (only the video element supports `webkitEnterFullscreen`).
        const video = el.querySelector("video");
        if (video && typeof video.webkitEnterFullscreen === "function") {
            try { video.webkitEnterFullscreen(); return; } catch { /* fall through */ }
        }
        // 3. Last resort: CSS-only fake-fullscreen — the wrapper switches to
        //    `fixed inset-0` and listeners on Esc / back-swipe close it.
        setIsFullscreen(true);
    };

    // Esc / back-button closes the CSS fake-fullscreen.
    useEffect(() => {
        if (!isFullscreen) return;
        const onKey = (e) => { if (e.key === "Escape") setIsFullscreen(false); };
        window.addEventListener("keydown", onKey);
        return () => window.removeEventListener("keydown", onKey);
    }, [isFullscreen]);

    useEffect(() => {
        const onFs = () => setIsFullscreen(!!document.fullscreenElement);
        document.addEventListener("fullscreenchange", onFs);
        document.addEventListener("webkitfullscreenchange", onFs);
        return () => {
            document.removeEventListener("fullscreenchange", onFs);
            document.removeEventListener("webkitfullscreenchange", onFs);
        };
    }, []);

    useEffect(() => { loadSession(); loadTopTippers(); }, [loadSession, loadTopTippers]);

    // Poll session + top tippers every 5 s while live for live counters.
    useEffect(() => {
        if (!session || session.status !== "live") return;
        const iv = setInterval(() => { loadSession(); loadTopTippers(); }, 5000);
        return () => clearInterval(iv);
    }, [session?.status, loadSession, loadTopTippers]);

    // Once the live ends, fetch the final leaderboard one more time.
    useEffect(() => {
        if (session?.status === "ended") loadTopTippers();
    }, [session?.status, loadTopTippers]);

    // Fan heartbeat: every 10 s while watching → backend computes viewer count.
    useEffect(() => {
        if (!joined || isHost) return;
        const hb = async () => { try { await api.post(`/live/${sessionId}/heartbeat`); } catch { /* ignore */ } };
        hb();
        const iv = setInterval(hb, 10000);
        return () => clearInterval(iv);
    }, [joined, isHost, sessionId]);

    // Host heartbeat: every 15 s. If the host stops pinging for >90 s the
    // backend reaper auto-ends the session.
    useEffect(() => {
        const isLive = isHost && session?.status === "live";
        if (!isLive) return;
        const ping = async () => {
            try { await api.post(`/live/${sessionId}/host-heartbeat`); } catch { /* noop */ }
        };
        ping();
        const iv = setInterval(ping, 15000);
        return () => clearInterval(iv);
    }, [isHost, session?.status, sessionId]);

    // Real page-lifecycle quit beacon (tab close, navigation). Never fires on
    // React effect cleanup (which would otherwise end the live on every re-render).
    const hostQuitRef = useRef({ isHost: false, sessionId: null, status: null });
    useEffect(() => {
        hostQuitRef.current = { isHost, sessionId, status: session?.status };
    }, [isHost, sessionId, session?.status]);

    useEffect(() => {
        const sendQuitBeacon = () => {
            const ctx = hostQuitRef.current;
            if (!ctx.isHost || !ctx.sessionId || ctx.status !== "live") return;
            try {
                const token = tokenStore.get();
                const url = `${API}/live/${ctx.sessionId}/host-quit`;
                const blob = new Blob([JSON.stringify({ token })], { type: "application/json" });
                if (navigator.sendBeacon) navigator.sendBeacon(url, blob);
                else fetch(url, {
                    method: "POST",
                    headers: { "Content-Type": "application/json", Authorization: `Bearer ${token}` },
                    body: JSON.stringify({ token }), keepalive: true,
                }).catch(() => {});
            } catch { /* ignore */ }
        };
        const onPageHide = (e) => { if (e?.persisted) return; sendQuitBeacon(); };
        const onBeforeUnload = () => sendQuitBeacon();
        window.addEventListener("pagehide", onPageHide);
        window.addEventListener("beforeunload", onBeforeUnload);
        return () => {
            window.removeEventListener("pagehide", onPageHide);
            window.removeEventListener("beforeunload", onBeforeUnload);
            sendQuitBeacon();
        };
        // eslint-disable-next-line react-hooks/exhaustive-deps
    }, []);

    // Auto-join for the host so the camera publishes immediately.
    useEffect(() => {
        if (session && session.status === "live" && isHost && !joined && !joinInfo) {
            joinLive();
        }
        // eslint-disable-next-line react-hooks/exhaustive-deps
    }, [session, isHost]);

    const joinLive = async () => {
        setErr("");
        try {
            const { data } = await api.post(`/live/${sessionId}/join`);
            setJoinInfo(data);
            setJoined(true);
            setPpvLocked(false);
            if (!isHost) refreshWallet();
        } catch (e) {
            const detail = e.response?.data?.detail;
            if (detail?.error === "insufficient_coins") {
                setErr(`Solde insuffisant (${detail.balance}/${detail.needed} coins). Recharge ton wallet.`);
                setTimeout(() => nav("/wallet"), 1200);
            } else { setErr(formatApiError(detail) || e.message); }
        }
    };

    // Poll chat
    const pollChat = useCallback(async () => {
        try {
            const url = `/live/${sessionId}/chat` + (sinceRef.current ? `?since=${encodeURIComponent(sinceRef.current)}` : "");
            const { data } = await api.get(url);
            if (data.length > 0) {
                setChat((prev) => [...prev, ...data].slice(-200));
                sinceRef.current = data[data.length - 1].created_at;
            }
        } catch { /* noop */ }
    }, [sessionId]);

    useEffect(() => {
        if (!session || session.status !== "live") return;
        pollChat();
        pollRef.current = setInterval(pollChat, 2500);
        return () => clearInterval(pollRef.current);
    }, [session, pollChat]);

    const sendChat = async (e) => {
        e.preventDefault();
        if (!msg.trim()) return;
        const body = msg; setMsg("");
        try {
            await api.post(`/live/${sessionId}/chat`, { body });
            pollChat();
        } catch (e) {
            setErr(formatApiError(e.response?.data?.detail) || e.message);
            setMsg(body);
        }
    };

    const stopLive = async () => {
        if (!window.confirm("Terminer le live maintenant ?")) return;
        try { await api.post(`/live/${sessionId}/stop`); await loadSession(); }
        catch { /* noop */ }
    };

    const toggleFavorite = async () => {
        if (!user || !session) return;
        const next = !session.is_favorited;
        setSession((s) => s ? {
            ...s,
            is_favorited: next,
            favorites_count: Math.max(0, (s.favorites_count || 0) + (next ? 1 : -1)),
        } : s);
        try {
            if (next) await api.post(`/live/${sessionId}/favorite`);
            else await api.delete(`/live/${sessionId}/favorite`);
        } catch {
            setSession((s) => s ? {
                ...s,
                is_favorited: !next,
                favorites_count: Math.max(0, (s.favorites_count || 0) + (next ? -1 : 1)),
            } : s);
        }
    };

    // Derive "tip-only" messages for the ticker.
    const tipMessages = useMemo(
        () => chat.filter((m) => m.is_tip).map((m) => ({
            id: m.message_id,
            name: m.name || "Anonyme",
            coins: m.tip_coins || 0,
            message: m.body || "",
        })),
        [chat],
    );

    // Top tipper of the current session (used for the in-stage badge).
    const topTipper = topTippers[0];

    if (loading) return <div className="container-mx py-24 text-center text-white/40" data-testid="live-loading">Chargement du live…</div>;
    if (!session) return <div className="container-mx py-24 text-center text-white/60">{err || "Live introuvable"}</div>;

    // POST-STREAM RECAP ----------------------------------------------------
    if (isEnded) {
        return (
            <div className="relative z-10 container-mx py-8">
                <LiveEndedRecap session={session} topTippers={topTippers} />
            </div>
        );
    }

    const useLiveKit = joinInfo?.token && joinInfo?.url && !joinInfo?.demo_mode;

    return (
        <div className="relative z-10 container-mx py-4 sm:py-6">
            <div className="grid gap-4 lg:grid-cols-12">
                {/* ============== STAGE COLUMN ============== */}
                <div className="lg:col-span-8">
                    <div className="surface-card !p-0 overflow-hidden">
                        {/* HEADER */}
                        <div className="flex items-center justify-between gap-3 border-b border-white/5 p-3 sm:p-4">
                            <div className="flex min-w-0 items-center gap-3">
                                {session.creator_avatar ? (
                                    <img src={session.creator_avatar} alt=""
                                         className="h-12 w-12 rounded-2xl border-2 border-magenta/50 object-cover sm:h-14 sm:w-14" />
                                ) : (
                                    <div className="flex h-12 w-12 items-center justify-center rounded-2xl border-2 border-magenta/50 bg-magenta/20 text-lg font-bold sm:h-14 sm:w-14">
                                        {session.creator_name?.[0]?.toUpperCase() || "•"}
                                    </div>
                                )}
                                <div className="min-w-0">
                                    <div className="flex flex-wrap items-center gap-2">
                                        <span className="inline-flex items-center gap-1 rounded-full bg-red-500/25 px-2 py-0.5 text-[10px] font-bold uppercase tracking-widest text-red-200">
                                            <span className="h-1.5 w-1.5 rounded-full bg-red-400 animate-pulse" /> Live
                                        </span>
                                        <LiveDurationTimer startedAt={session.started_at} />
                                    </div>
                                    <div className="mt-0.5 truncate font-display text-base font-bold sm:text-lg">
                                        {session.title}
                                    </div>
                                    <Link to={`/createur/${session.creator_id}`}
                                          className="block truncate text-xs text-white/50 hover:text-magenta-200 transition-colors">
                                        {session.creator_name} · @{session.creator_handle}
                                    </Link>
                                </div>
                            </div>
                            <div className="flex flex-shrink-0 flex-wrap items-center gap-2 text-xs text-white/60">
                                <span
                                    data-testid="live-viewers"
                                    className={`inline-flex items-center gap-1 rounded-full border border-white/10 bg-white/[0.04] px-2.5 py-1 transition-transform ${viewerPulse ? "scale-110 border-magenta/60 bg-magenta/15 text-white" : ""}`}
                                >
                                    <Eye size={12} /> {session.viewer_count || 0}
                                </span>
                                <span data-testid="live-favorites" className="inline-flex items-center gap-1 rounded-full border border-white/10 bg-white/[0.04] px-2.5 py-1">
                                    <Heart size={12} className="text-red-300" fill={session.is_favorited ? "currentColor" : "none"} /> {session.favorites_count || 0}
                                </span>
                                {!isHost && user && (
                                    <button
                                        type="button"
                                        onClick={toggleFavorite}
                                        data-testid="live-favorite-btn"
                                        aria-pressed={session.is_favorited}
                                        aria-label={session.is_favorited ? "Retirer des favoris" : "Ajouter aux favoris"}
                                        className={`inline-flex items-center gap-1 rounded-full border px-2.5 py-1 text-[11px] font-semibold transition-all ${
                                            session.is_favorited
                                                ? "border-red-500/50 bg-red-500/20 text-red-200"
                                                : "border-white/10 bg-white/[0.03] text-white/70 hover:border-red-400/40 hover:text-white"
                                        }`}
                                    >
                                        <Heart size={11} fill={session.is_favorited ? "currentColor" : "none"} />
                                        {session.is_favorited ? "Favori" : "Favori"}
                                    </button>
                                )}
                            </div>
                        </div>

                        {/* STAGE — `aspect-video` in normal flow; full-viewport
                            (with safe-area + 100dvh for iOS) when fullscreen. */}
                        <div
                            ref={stageRef}
                            className={`relative bg-black ${
                                isFullscreen
                                    ? "fixed inset-0 z-[80] flex items-center justify-center"
                                    : "aspect-video"
                            }`}
                            style={isFullscreen ? { width: "100vw", height: "100dvh" } : undefined}
                            data-testid="live-stage"
                        >
                            {ppvLocked ? (
                                <PaywallOverlay
                                    icon={Coins}
                                    title={`Live payant · ${session.ppv_coins} coins`}
                                    body={`Déverrouille pour rejoindre le live de ${session.creator_name}.`}
                                    cta={`Déverrouiller · ${session.ppv_coins} coins`}
                                    testId="live-unlock-btn"
                                    onClick={joinLive}
                                />
                            ) : privateLocked ? (
                                <PaywallOverlay
                                    icon={Lock}
                                    title="🔒 Mode privé"
                                    body={`Ce live est en mode privé. Règle ton entrée pour rejoindre ${session.creator_name}.`}
                                    cta={privatePaying ? "Paiement…" : `Entrer · ${session.private_entry_coins || 0} coins`}
                                    disabled={privatePaying || !user}
                                    testId="live-private-pay-btn"
                                    onClick={payPrivate}
                                    footer={!user && (
                                        <Link to={`/login?next=/live/${sessionId}`} className="text-xs text-magenta-200 underline">
                                            Connecte-toi pour payer
                                        </Link>
                                    )}
                                />
                            ) : !joined ? (
                                <div className="absolute inset-0 flex flex-col items-center justify-center gap-3 p-6 text-center">
                                    <Radio size={40} className="text-magenta-300 animate-pulse" />
                                    <div className="font-display text-xl font-bold">Prêt(e) à rejoindre ?</div>
                                    <button onClick={joinLive} className="btn-primary" data-testid="live-join-btn">
                                        {isHost ? "Entrer dans la régie" : "Rejoindre le live"}
                                    </button>
                                </div>
                            ) : useLiveKit ? (
                                <LiveKitRoom
                                    token={joinInfo.token}
                                    serverUrl={joinInfo.url}
                                    connect
                                    video={isHost}
                                    audio={isHost}
                                    data-lk-theme="default"
                                    className="h-full w-full"
                                >
                                    {isHost ? (
                                        <>
                                            <LiveHostStage sessionId={sessionId} />
                                            <LiveHostControls />
                                        </>
                                    ) : (
                                        <LiveViewer
                                            creatorDisplay={session.creator_display_name || session.creator_handle}
                                            onExit={() => nav("/live")}
                                        />
                                    )}
                                    <RoomAudioRenderer />
                                </LiveKitRoom>
                            ) : (
                                <div className="absolute inset-0 flex flex-col items-center justify-center gap-3 bg-gradient-to-br from-magenta/20 via-obsidian to-obsidian p-6 text-center">
                                    <Radio size={48} className="text-magenta-300 animate-pulse" />
                                    <div className="font-display text-xl font-bold text-white">
                                        {isHost ? "🎥 Tu es en direct (mode démo)" : "📡 Live en cours (mode démo)"}
                                    </div>
                                    <p className="max-w-md text-sm text-white/60">
                                        Le streaming vidéo n'est pas encore activé (LiveKit non configuré).
                                        Le chat et les tips fonctionnent en temps réel ci-dessous.
                                    </p>
                                </div>
                            )}

                            {/* Top-left badges (Private) */}
                            {joined && !ppvLocked && !privateLocked && session.private_mode && (
                                <div className="pointer-events-none absolute left-3 top-12 z-10 flex flex-wrap gap-1.5">
                                    <span className="inline-flex items-center gap-1 rounded-full bg-magenta/85 px-2 py-0.5 text-[10px] font-bold uppercase tracking-widest text-white backdrop-blur" data-testid="live-private-badge">
                                        <Lock size={10} /> Privé
                                    </span>
                                </div>
                            )}

                            {/* Tip ticker — top-center, always visible to viewers */}
                            {joined && !ppvLocked && !privateLocked && tipMessages.length > 0 && (
                                <TipTicker tips={tipMessages} />
                            )}

                            {/* Top tipper banner — small crown next to ticker */}
                            {joined && !ppvLocked && !privateLocked && topTipper && topTipper.coins > 0 && (
                                <div className="pointer-events-none absolute right-3 top-12 z-10 inline-flex items-center gap-1.5 rounded-full border border-amber-300/40 bg-black/55 px-2.5 py-1 text-[11px] font-semibold text-amber-200 backdrop-blur" data-testid="live-top-tipper">
                                    <Crown size={11} /> #1 {topTipper.name?.split(" ")[0] || "Top"}
                                    <span className="font-mono text-amber-100/90">· {topTipper.coins}</span>
                                </div>
                            )}

                            {/* Tip-goal progress bar */}
                            {joined && !ppvLocked && !privateLocked && (
                                <TipGoalBar
                                    goalCoins={session.goal_coins || 0}
                                    totalTips={session.total_tips || 0}
                                    description={session.goal_description}
                                    celebrate={goalCelebrate}
                                />
                            )}

                            {/* Fullscreen toggle */}
                            {joined && !ppvLocked && !privateLocked && (
                                <button
                                    onClick={toggleFullscreen}
                                    aria-label={isFullscreen ? "Quitter le plein écran" : "Plein écran"}
                                    className="pointer-events-auto absolute right-3 top-3 z-20 rounded-full border border-white/20 bg-black/60 p-2 text-white backdrop-blur transition-all hover:bg-black/80 hover:scale-105"
                                    data-testid="live-fullscreen-btn"
                                >
                                    {isFullscreen ? <Minimize2 size={16} /> : <Maximize2 size={16} />}
                                </button>
                            )}
                        </div>

                        {/* HOST ACTION BAR */}
                        {isHost && (
                            <div className="flex flex-wrap items-center justify-between gap-3 border-t border-white/5 p-3 sm:p-4">
                                <div className="flex flex-wrap items-center gap-2 text-xs">
                                    <HostPill icon={Users} value={session.viewer_count || 0} label="spectateurs" testId="live-host-viewers" tone="neutral" />
                                    <HostPill icon={Coins} value={session.coins_earned || 0} label="coins" testId="live-host-coins" tone="amber" />
                                    <HostPill icon={Heart} value={session.favorites_count || 0} label="favoris" testId="live-host-favorites" tone="red" />
                                </div>
                                <div className="flex items-center gap-2">
                                    <button onClick={() => setHostPanelOpen((p) => !p)}
                                            className="inline-flex items-center gap-1.5 rounded-full border border-magenta/30 bg-magenta/10 px-4 py-2 text-sm font-semibold text-magenta-200 transition-all hover:bg-magenta/20 hover:scale-105 active:scale-95"
                                            data-testid="live-host-settings-btn">
                                        <Sliders size={14} /> Réglages
                                    </button>
                                    <button onClick={stopLive}
                                            className="inline-flex items-center gap-1.5 rounded-full border border-red-500/30 bg-red-500/10 px-4 py-2 text-sm font-semibold text-red-300 transition-all hover:bg-red-500/20 hover:scale-105 active:scale-95"
                                            data-testid="live-stop-btn">
                                        <StopCircle size={14} /> Terminer le live
                                    </button>
                                </div>
                            </div>
                        )}

                        {isHost && hostPanelOpen && (
                            <HostLiveSettings session={session} onUpdate={loadSession} onClose={() => setHostPanelOpen(false)} />
                        )}
                    </div>
                </div>

                {/* ============== CHAT COLUMN ==============
                    On mobile (<lg) the chat flows naturally below the stage so
                    the tip menu + chat are always visible without a FAB.
                    On lg+ it sits side-by-side with the video. */}
                <div className="lg:col-span-4">
                    <ChatPanel
                        session={session}
                        sessionId={sessionId}
                        chat={chat}
                        msg={msg}
                        setMsg={setMsg}
                        sendChat={sendChat}
                        isHost={isHost}
                        user={user}
                        joined={joined}
                        ppvLocked={ppvLocked}
                        privateLocked={privateLocked}
                        onTipClick={(preset) => { setTipPreset(preset); setTipOpen(true); }}
                        err={err}
                    />
                </div>
            </div>

            {tipOpen && (
                <TipModal
                    sessionId={sessionId}
                    creatorName={session.creator_name}
                    presetCoins={tipPreset?.coins}
                    presetLabel={tipPreset?.label}
                    onClose={(success) => {
                        setTipOpen(false);
                        setTipPreset(null);
                        if (success) { refreshWallet(); loadSession(); loadTopTippers(); }
                    }}
                />
            )}
        </div>
    );
}

// ============================================================================
//  Sub-components
// ============================================================================

function HostPill({ icon: Icon, value, label, testId, tone = "neutral" }) {
    const tones = {
        neutral: "border-white/10 bg-white/[0.03] text-white",
        amber:   "border-amber-500/30 bg-amber-500/10 text-amber-200",
        red:     "border-red-500/30 bg-red-500/10 text-red-200",
    };
    return (
        <span data-testid={testId}
              className={`inline-flex items-center gap-1.5 rounded-full border px-3 py-1 font-semibold transition-colors ${tones[tone]}`}>
            <Icon size={12} /> <span className="font-mono">{value}</span> {label}
        </span>
    );
}

function PaywallOverlay({ icon: Icon, title, body, cta, onClick, disabled, testId, footer }) {
    return (
        <div className="absolute inset-0 flex flex-col items-center justify-center gap-3 bg-gradient-to-br from-magenta/20 via-obsidian to-obsidian p-6 text-center" data-testid="live-paywall">
            <Icon size={32} className="text-magenta-200" />
            <div className="font-display text-xl font-bold">{title}</div>
            <p className="max-w-sm text-sm text-white/60">{body}</p>
            <button onClick={onClick} disabled={disabled} className="btn-primary" data-testid={testId}>
                {cta}
            </button>
            {footer}
        </div>
    );
}

function ChatPanel({
    session, sessionId, chat, msg, setMsg, sendChat,
    isHost, user, joined, ppvLocked, privateLocked, onTipClick, err, noBorder,
}) {
    return (
        <div className={`flex h-full min-h-[60vh] flex-col ${noBorder ? "" : "surface-card !p-0"} `}>
            {/* Tip menu — Stripchat-style quick-tip tiles */}
            {!isHost && user && joined && !ppvLocked && !privateLocked && (session.tip_menu?.length > 0) && (
                <div className="border-b border-white/5 p-3" data-testid="live-tip-menu">
                    <div className="overline mb-2 flex items-center gap-1.5">
                        <Gift size={11} className="text-magenta-200" /> Menu pourboires
                    </div>
                    <div className="grid grid-cols-2 gap-2 sm:grid-cols-3">
                        {session.tip_menu.slice(0, 9).map((it, i) => (
                            <button
                                key={i}
                                onClick={() => onTipClick({ coins: it.coins, label: it.label })}
                                className="group flex items-center justify-between gap-1 rounded-xl border border-magenta/25 bg-gradient-to-br from-magenta/10 to-magenta/5 p-2.5 text-left transition-all duration-200 hover:border-magenta/60 hover:from-magenta/20 hover:scale-[1.04] active:scale-95"
                                data-testid={`live-tip-menu-item-${i}`}
                                title={`${it.label} · ${it.coins} coins`}
                            >
                                <span className="flex items-center gap-1.5 truncate">
                                    <span className="text-lg" aria-hidden="true">{it.emoji || "✨"}</span>
                                    <span className="truncate text-xs text-white/85 group-hover:text-white">{it.label}</span>
                                </span>
                                <span className="font-mono text-[11px] text-magenta-200 group-hover:text-amber-200">
                                    {it.coins}
                                </span>
                            </button>
                        ))}
                    </div>
                </div>
            )}

            <div className="flex items-center justify-between border-b border-white/5 p-3">
                <div className="overline">Chat live</div>
                {!isHost && user && (
                    <button
                        onClick={() => onTipClick(null)}
                        className="inline-flex items-center gap-1 rounded-full border border-magenta/40 bg-gradient-to-r from-magenta/15 to-magenta/5 px-3 py-1 text-xs font-semibold text-magenta-200 transition-all hover:from-magenta/25 hover:scale-105"
                        data-testid="live-tip-btn"
                    >
                        <Gift size={12} /> Pourboire
                    </button>
                )}
            </div>

            <LiveChatList messages={chat} />

            {user ? (
                <form onSubmit={sendChat} className="border-t border-white/5 p-3">
                    <div className="flex items-center gap-2">
                        <input
                            value={msg}
                            onChange={(e) => setMsg(e.target.value)}
                            placeholder="Écris dans le chat…"
                            maxLength={300}
                            className="input-base text-sm"
                            data-testid="live-chat-input"
                        />
                        <button type="submit" disabled={!msg.trim()} className="btn-primary !px-4" data-testid="live-chat-send">
                            <Send size={14} />
                        </button>
                    </div>
                </form>
            ) : (
                <div className="border-t border-white/5 p-3 text-center text-xs text-white/50">
                    <Link to={`/login?next=/live/${sessionId}`} className="text-magenta-200 hover:text-white">Connecte-toi</Link> pour chatter.
                </div>
            )}
            {err && <div className="m-3 rounded-lg border border-red-500/30 bg-red-500/10 p-3 text-sm text-red-300" data-testid="live-error">{err}</div>}
        </div>
    );
}

function TipModal({ sessionId, creatorName, presetCoins, presetLabel, onClose }) {
    const [coins, setCoins] = useState(presetCoins || 50);
    const [message, setMessage] = useState(presetLabel ? `Pour ${presetLabel} 💜` : "");
    const [err, setErr] = useState("");
    const [loading, setLoading] = useState(false);

    const submit = async (e) => {
        e.preventDefault(); setErr(""); setLoading(true);
        try {
            await api.post(`/live/${sessionId}/tip`, { coins: Number(coins), message });
            onClose(true);
        } catch (e) {
            const d = e.response?.data?.detail;
            if (d?.error === "insufficient_coins") setErr(`Solde insuffisant (${d.balance}/${d.needed} coins)`);
            else setErr(formatApiError(d) || e.message);
            setLoading(false);
        }
    };

    return (
        <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/80 backdrop-blur p-4 animate-fadeUp" data-testid="live-tip-modal">
            <form onSubmit={submit} className="w-full max-w-md rounded-2xl border border-magenta/30 bg-surface p-6 shadow-glowStrong">
                <div className="flex items-center justify-between">
                    <h3 className="flex items-center gap-2 font-display text-xl font-bold">
                        <Zap size={18} className="text-magenta-200" /> Pourboire live
                    </h3>
                    <button type="button" onClick={() => onClose(false)} className="rounded-full p-1 text-white/50 hover:bg-white/5">
                        <X size={16} />
                    </button>
                </div>
                <p className="mt-2 text-sm text-white/60">Envoie des coins à {creatorName} — ils apparaissent en surbrillance dans le chat.</p>
                <div className="mt-4 flex flex-wrap gap-2">
                    {[25, 50, 100, 250, 500].map((v) => (
                        <button type="button" key={v} onClick={() => setCoins(v)}
                                data-testid={`live-tip-preset-${v}`}
                                className={`flex-1 rounded-xl border px-2 py-2 font-mono text-sm transition-all ${
                                    coins === v ? "border-magenta bg-magenta/20 scale-105" : "border-white/10 hover:border-white/30"
                                }`}>
                            {v}
                        </button>
                    ))}
                </div>
                <input type="number" min={1} max={10000} value={coins}
                       onChange={(e) => setCoins(Number(e.target.value))}
                       className="input-base mt-3 font-mono" data-testid="live-tip-amount" />
                <input
                    placeholder="Message (optionnel)"
                    value={message}
                    onChange={(e) => setMessage(e.target.value)}
                    className="input-base mt-3 text-sm"
                    maxLength={200}
                    data-testid="live-tip-message"
                />
                {err && <div className="mt-3 rounded-lg border border-red-500/30 bg-red-500/10 p-3 text-sm text-red-300">{err}</div>}
                <button type="submit" disabled={loading} className="btn-primary mt-4 w-full justify-center" data-testid="live-tip-submit">
                    <Coins size={14} /> {loading ? "Envoi…" : `Envoyer ${coins} coins`}
                </button>
            </form>
        </div>
    );
}

function HostLiveSettings({ session, onUpdate, onClose }) {
    const [goalCoins, setGoalCoins] = useState(session.goal_coins || 0);
    const [goalDesc, setGoalDesc] = useState(session.goal_description || "");
    const [privOn, setPrivOn] = useState(!!session.private_mode);
    const [privEntry, setPrivEntry] = useState(session.private_entry_coins || 100);
    const [tipMenu, setTipMenu] = useState(session.tip_menu || []);
    const [saving, setSaving] = useState(false);
    const [err, setErr] = useState("");

    const save = async () => {
        setSaving(true); setErr("");
        try {
            await api.patch(`/live/${session.session_id}/settings`, {
                goal_coins: Number(goalCoins) || 0,
                goal_description: goalDesc,
                private_mode: privOn,
                private_entry_coins: privOn ? Number(privEntry) : 0,
                tip_menu: tipMenu
                    .filter((i) => (i.label || "").trim() && Number(i.coins) > 0)
                    .map((i) => ({ label: i.label.trim(), emoji: i.emoji || "✨", coins: Number(i.coins) })),
            });
            await onUpdate?.();
            onClose?.();
        } catch (e) {
            setErr(formatApiError(e.response?.data?.detail) || e.message);
        } finally { setSaving(false); }
    };

    return (
        <div className="border-t border-magenta/20 bg-gradient-to-br from-magenta/10 via-transparent to-transparent p-4 animate-fadeUp" data-testid="live-host-settings-panel">
            <div className="flex items-start justify-between gap-3">
                <div className="overline flex items-center gap-1.5">
                    <Sliders size={11} /> Réglages live
                </div>
                <button onClick={onClose} className="text-white/40 hover:text-white" data-testid="host-settings-close">
                    <X size={14} />
                </button>
            </div>
            <div className="mt-3 grid gap-3 sm:grid-cols-2">
                {/* Goal */}
                <div className="rounded-lg border border-white/10 bg-white/[0.02] p-3">
                    <div className="mb-2 flex items-center gap-1.5 text-xs text-white/60">
                        <Target size={11} /> Objectif pourboires
                    </div>
                    <input type="number" min={0} className="input-base font-mono text-sm"
                           value={goalCoins} onChange={(e) => setGoalCoins(e.target.value)}
                           placeholder="Coins" data-testid="host-goal-coins" />
                    <input type="text" className="input-base mt-2 text-sm"
                           value={goalDesc} onChange={(e) => setGoalDesc(e.target.value)}
                           placeholder="Description (set photo, dance, etc.)" data-testid="host-goal-desc" />
                </div>
                {/* Private */}
                <div className="rounded-lg border border-white/10 bg-white/[0.02] p-3">
                    <label className="flex items-center gap-2 text-xs text-white/80">
                        <input type="checkbox" checked={privOn} onChange={(e) => setPrivOn(e.target.checked)}
                               className="h-3.5 w-3.5 accent-magenta" data-testid="host-priv-toggle" />
                        <Lock size={11} /> Mode privé
                    </label>
                    {privOn && (
                        <input type="number" min={1} className="input-base mt-2 font-mono text-sm"
                               value={privEntry} onChange={(e) => setPrivEntry(e.target.value)}
                               placeholder="Coins d'entrée" data-testid="host-priv-coins" />
                    )}
                </div>
                {/* Tip menu */}
                <div className="rounded-lg border border-white/10 bg-white/[0.02] p-3 sm:col-span-2">
                    <div className="mb-2 flex items-center gap-1.5 text-xs text-white/80">
                        <Gift size={11} className="text-magenta-200" /> Menu pourboires
                    </div>
                    <TipMenuEditor items={tipMenu} onChange={setTipMenu} max={12} />
                </div>
                {/* Moderation (banned + moderators) */}
                <LiveModerationPanel sessionId={session.session_id} />
            </div>
            {err && <div className="mt-3 rounded-lg border border-red-500/30 bg-red-500/10 p-2 text-xs text-red-300">{err}</div>}
            <button onClick={save} disabled={saving}
                    className="btn-primary mt-4 w-full justify-center" data-testid="host-settings-save">
                <Save size={14} /> {saving ? "Enregistrement…" : "Appliquer"}
            </button>
        </div>
    );
}
