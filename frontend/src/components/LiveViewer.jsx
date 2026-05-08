import { useEffect, useRef, useState, useCallback } from "react";
import {
    useTracks, useRoomContext, useRemoteParticipants,
} from "@livekit/components-react";
import { Track, RoomEvent } from "livekit-client";
import {
    Volume2, VolumeX, Maximize, Minimize, LogOut, Settings, Loader2, Video as VideoIcon,
} from "lucide-react";

/**
 * Fan-side live viewer: single-stream, full-screen friendly player with
 * volume/mute, fullscreen, quality selector, and exit controls.
 * Blocks right-click + long-press on the video to deter casual screen-recording.
 */
export default function LiveViewer({ onExit, creatorDisplay }) {
    const room = useRoomContext();
    const remotes = useRemoteParticipants();
    const tracks = useTracks(
        [Track.Source.Camera, Track.Source.ScreenShare],
        { onlySubscribed: true },
    );
    // Find the creator's (first remote) video track
    const cameraTrack = tracks.find((t) => t.source === Track.Source.Camera && !t.participant?.isLocal);
    const videoRef = useRef(null);
    const wrapperRef = useRef(null);
    const audioRef = useRef(null);
    const [muted, setMuted] = useState(true); // browsers require muted autoplay
    const [volume, setVolume] = useState(0.8);
    const [fullscreen, setFullscreen] = useState(false);
    const [settingsOpen, setSettingsOpen] = useState(false);
    const [quality, setQuality] = useState("auto"); // auto | high | medium | low
    const [connecting, setConnecting] = useState(true);

    // Attach the creator video track to our single <video> element
    useEffect(() => {
        if (!cameraTrack || !videoRef.current) return;
        const publication = cameraTrack.publication;
        const track = publication?.track;
        if (!track) return;
        track.attach(videoRef.current);
        setConnecting(false);
        return () => { try { track.detach(videoRef.current); } catch { /* ignore */ } };
    }, [cameraTrack]);

    // Attach the audio track to a hidden audio element so volume slider works
    useEffect(() => {
        const audioTrack = tracks.find((t) => t.source === Track.Source.Microphone && !t.participant?.isLocal)?.publication?.track;
        if (!audioTrack || !audioRef.current) return;
        audioTrack.attach(audioRef.current);
        return () => { try { audioTrack.detach(audioRef.current); } catch { /* ignore */ } };
    }, [tracks]);

    // Volume / mute state
    useEffect(() => {
        if (audioRef.current) {
            audioRef.current.volume = volume;
            audioRef.current.muted = muted;
        }
        if (videoRef.current) {
            videoRef.current.volume = volume;
            videoRef.current.muted = muted;
        }
    }, [volume, muted]);

    // Quality: subscribe to a specific video layer
    useEffect(() => {
        if (!cameraTrack?.publication) return;
        const pub = cameraTrack.publication;
        try {
            if (quality === "auto") {
                pub.setVideoQuality?.(2); // HIGH by default → adaptive if simulcast
            } else if (quality === "high") {
                pub.setVideoQuality?.(2);
            } else if (quality === "medium") {
                pub.setVideoQuality?.(1);
            } else if (quality === "low") {
                pub.setVideoQuality?.(0);
            }
        } catch { /* ignore if not simulcast */ }
    }, [quality, cameraTrack]);

    // Toggle fullscreen
    const toggleFullscreen = useCallback(async () => {
        const el = wrapperRef.current;
        if (!el) return;
        if (!document.fullscreenElement) {
            try { await el.requestFullscreen(); setFullscreen(true); }
            catch { /* ignore */ }
        } else {
            try { await document.exitFullscreen(); setFullscreen(false); }
            catch { /* ignore */ }
        }
    }, []);
    useEffect(() => {
        const onFsChange = () => setFullscreen(!!document.fullscreenElement);
        document.addEventListener("fullscreenchange", onFsChange);
        return () => document.removeEventListener("fullscreenchange", onFsChange);
    }, []);

    const stop = (e) => { e.preventDefault(); e.stopPropagation(); return false; };

    // Connecting state: nobody publishing yet
    const nothingToShow = !cameraTrack || connecting;

    return (
        <div
            ref={wrapperRef}
            className="relative h-full w-full select-none bg-black"
            style={{ WebkitTouchCallout: "none", WebkitUserSelect: "none", userSelect: "none" }}
            onContextMenu={stop}
            onDragStart={stop}
            data-testid="live-viewer"
        >
            <video
                ref={videoRef}
                autoPlay
                playsInline
                muted={muted}
                onContextMenu={stop}
                onDragStart={stop}
                controlsList="nodownload noremoteplayback"
                disablePictureInPicture
                className="h-full w-full bg-black object-contain"
                style={{ WebkitTouchCallout: "none", pointerEvents: "none" }}
            />
            <audio ref={audioRef} autoPlay style={{ display: "none" }} />

            {/* Connecting/no-stream overlay */}
            {nothingToShow && (
                <div className="absolute inset-0 flex flex-col items-center justify-center gap-3 bg-gradient-to-br from-magenta/20 via-obsidian to-obsidian p-6 text-center pointer-events-none" data-testid="live-viewer-connecting">
                    <Loader2 size={40} className="animate-spin text-magenta-300" />
                    <div className="font-display text-xl font-bold text-white">En attente du flux…</div>
                    <p className="max-w-md text-sm text-white/60">
                        {creatorDisplay ? `${creatorDisplay} se connecte, patiente quelques secondes.` : "La créatrice se connecte…"}
                    </p>
                </div>
            )}

            {/* Big tap-to-unmute overlay when muted and video is playing */}
            {muted && !nothingToShow && (
                <button
                    type="button"
                    onClick={() => setMuted(false)}
                    data-testid="live-unmute-overlay"
                    className="absolute inset-0 flex items-center justify-center bg-black/40 backdrop-blur-sm transition-colors hover:bg-black/50"
                >
                    <div className="flex flex-col items-center gap-2 rounded-2xl border border-white/20 bg-black/60 px-6 py-4">
                        <VolumeX size={32} className="text-white" />
                        <div className="text-sm font-semibold text-white">Toucher pour activer le son</div>
                    </div>
                </button>
            )}

            {/* Bottom control bar */}
            <div className="pointer-events-auto absolute inset-x-0 bottom-0 flex items-center justify-between gap-2 bg-gradient-to-t from-black/90 via-black/50 to-transparent p-3">
                <div className="flex items-center gap-2">
                    <button
                        type="button"
                        onClick={() => setMuted(m => !m)}
                        data-testid="live-mute-btn"
                        aria-label={muted ? "Activer le son" : "Couper le son"}
                        className="inline-flex h-9 w-9 items-center justify-center rounded-full border border-white/10 bg-black/40 text-white hover:bg-black/60 transition-colors"
                    >
                        {muted ? <VolumeX size={16} /> : <Volume2 size={16} />}
                    </button>
                    {!muted && (
                        <input
                            type="range"
                            min="0" max="1" step="0.05"
                            value={volume}
                            onChange={(e) => setVolume(parseFloat(e.target.value))}
                            data-testid="live-volume-slider"
                            aria-label="Volume"
                            className="h-1 w-20 cursor-pointer accent-magenta"
                        />
                    )}
                </div>

                <div className="flex items-center gap-2">
                    <div className="relative">
                        <button
                            type="button"
                            onClick={() => setSettingsOpen(s => !s)}
                            data-testid="live-quality-btn"
                            aria-label="Qualité vidéo"
                            className="inline-flex items-center gap-1 rounded-full border border-white/10 bg-black/40 px-2.5 py-1.5 text-xs font-semibold text-white hover:bg-black/60 transition-colors"
                        >
                            <Settings size={13} />
                            <span className="uppercase">{quality}</span>
                        </button>
                        {settingsOpen && (
                            <div data-testid="live-quality-menu"
                                 className="absolute bottom-10 right-0 w-36 overflow-hidden rounded-xl border border-white/10 bg-black/95 shadow-2xl">
                                {["auto", "high", "medium", "low"].map((q) => (
                                    <button key={q}
                                            type="button"
                                            data-testid={`live-quality-${q}`}
                                            onClick={() => { setQuality(q); setSettingsOpen(false); }}
                                            className={`block w-full px-3 py-2 text-left text-xs font-semibold transition-colors ${quality === q ? "bg-magenta/30 text-white" : "text-white/70 hover:bg-white/10 hover:text-white"}`}>
                                        <VideoIcon size={11} className="mr-1.5 inline" />
                                        {q === "auto" ? "Automatique" : q === "high" ? "Haute (1080p)" : q === "medium" ? "Moyenne (720p)" : "Basse (360p)"}
                                    </button>
                                ))}
                            </div>
                        )}
                    </div>

                    <button
                        type="button"
                        onClick={toggleFullscreen}
                        data-testid="live-fullscreen-btn"
                        aria-label={fullscreen ? "Quitter le plein écran" : "Plein écran"}
                        className="inline-flex h-9 w-9 items-center justify-center rounded-full border border-white/10 bg-black/40 text-white hover:bg-black/60 transition-colors"
                    >
                        {fullscreen ? <Minimize size={16} /> : <Maximize size={16} />}
                    </button>

                    <button
                        type="button"
                        onClick={() => onExit?.()}
                        data-testid="live-exit-btn"
                        aria-label="Quitter le live"
                        className="inline-flex h-9 items-center gap-1 rounded-full border border-red-500/40 bg-red-500/15 px-3 text-xs font-bold text-red-200 hover:bg-red-500/30 transition-colors"
                    >
                        <LogOut size={13} /> Quitter
                    </button>
                </div>
            </div>
        </div>
    );
}
