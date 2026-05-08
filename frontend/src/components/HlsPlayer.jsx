import { useEffect, useRef, useState } from "react";
import Hls from "hls.js";
import { useTranslation } from "react-i18next";
import { Volume2, VolumeX, Maximize2, Loader2, WifiOff } from "lucide-react";

/**
 * HLS video player — proxied through /api/hls so no outbound redirect is possible.
 * Displays a small "Stripchat" attribution badge.
 */
export default function HlsPlayer({ src, poster, autoPlay = true, controls = false, className = "" }) {
    const { t } = useTranslation();
    const videoRef = useRef(null);
    const [loading, setLoading] = useState(true);
    const [muted, setMuted] = useState(true);
    const [errorKind, setErrorKind] = useState(null); // null | "offline" | "codec" | "network"

    useEffect(() => {
        const video = videoRef.current;
        if (!video || !src) return;
        setLoading(true); setErrorKind(null);

        let hls;
        let cancelled = false;
        const timer = setTimeout(() => {
            if (cancelled || !videoRef.current) return;

            if (Hls.isSupported()) {
                hls = new Hls({
                    liveDurationInfinity: true,
                    lowLatencyMode: true,
                    manifestLoadingTimeOut: 10000,
                    levelLoadingTimeOut: 10000,
                    fragLoadingTimeOut: 20000,
                    maxBufferLength: 8,
                    maxMaxBufferLength: 20,
                });
                hls.loadSource(src);
                hls.attachMedia(video);
                hls.on(Hls.Events.MANIFEST_PARSED, () => {
                    if (cancelled) return;
                    setLoading(false);
                    if (autoPlay) video.play().catch(() => { /* autoplay blocked */ });
                });
                hls.on(Hls.Events.ERROR, (_evt, data) => {
                    if (cancelled || !data?.fatal) return;
                    if (data.details === "manifestIncompatibleCodecsError") {
                        setErrorKind("codec"); setLoading(false); return;
                    }
                    if (data.type === Hls.ErrorTypes.NETWORK_ERROR) {
                        // Try to recover by reloading the manifest; if 404 → offline
                        if (data.details === "manifestLoadError" || data.response?.code === 404 || data.response?.code === 502) {
                            setErrorKind("offline"); setLoading(false);
                        } else {
                            try { hls.startLoad(); } catch { setErrorKind("network"); setLoading(false); }
                        }
                    } else if (data.type === Hls.ErrorTypes.MEDIA_ERROR) {
                        try { hls.recoverMediaError(); } catch { setErrorKind("offline"); setLoading(false); }
                    } else {
                        setErrorKind("offline"); setLoading(false);
                    }
                });
            } else if (video.canPlayType("application/vnd.apple.mpegurl")) {
                // Safari native
                video.src = src;
                video.addEventListener("loadedmetadata", () => { if (!cancelled) { setLoading(false); if (autoPlay) video.play().catch(() => {}); } });
                video.addEventListener("error", () => { if (!cancelled) { setErrorKind("offline"); setLoading(false); } });
            } else {
                setErrorKind("codec"); setLoading(false);
            }
        }, 0);
        return () => {
            cancelled = true;
            clearTimeout(timer);
            if (hls) { try { hls.destroy(); } catch { /* noop */ } }
        };
    }, [src, autoPlay]);

    const toggleMute = () => {
        const v = videoRef.current; if (!v) return;
        v.muted = !v.muted; setMuted(v.muted);
    };
    const fullscreen = () => {
        const v = videoRef.current;
        if (v?.requestFullscreen) v.requestFullscreen().catch(() => {});
    };

    return (
        <div className={`relative overflow-hidden bg-black ${className}`} data-testid="hls-player">
            <video
                ref={videoRef}
                poster={poster}
                muted={muted}
                playsInline
                autoPlay={autoPlay}
                controls={controls}
                className="h-full w-full object-contain"
            />
            {loading && !errorKind && (
                <div className="absolute inset-0 flex items-center justify-center bg-black/40">
                    <Loader2 className="animate-spin text-white/70" size={28} />
                </div>
            )}
            {errorKind && (
                <div className="absolute inset-0 flex flex-col items-center justify-center gap-2 bg-black/70 p-6 text-center" data-testid="hls-error">
                    <WifiOff size={28} className="text-white/50" />
                    <div className="font-display text-lg font-bold text-white">
                        {errorKind === "codec" ? t("cam.codec_title") : t("cam.offline_title")}
                    </div>
                    <div className="max-w-xs text-xs text-white/60">
                        {errorKind === "codec" ? t("cam.codec_body") : t("cam.offline_body")}
                    </div>
                </div>
            )}
            {!errorKind && !controls && (
                <div className="absolute bottom-3 right-3 flex items-center gap-2">
                    <button type="button" onClick={toggleMute} data-testid="hls-mute"
                        className="rounded-full border border-white/20 bg-black/60 p-2 text-white/90 hover:bg-black/80"
                        aria-label={muted ? "Activer le son" : "Couper le son"}>
                        {muted ? <VolumeX size={14} /> : <Volume2 size={14} />}
                    </button>
                    <button type="button" onClick={fullscreen} data-testid="hls-fullscreen"
                        className="rounded-full border border-white/20 bg-black/60 p-2 text-white/90 hover:bg-black/80"
                        aria-label="Plein écran">
                        <Maximize2 size={14} />
                    </button>
                </div>
            )}
            <div className="pointer-events-none absolute bottom-2 left-2 rounded-full bg-black/60 px-2 py-0.5 text-[10px] font-semibold uppercase tracking-widest text-white/70">
                Stripchat
            </div>
        </div>
    );
}
