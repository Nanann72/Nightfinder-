import { useEffect, useRef, useState } from "react";
import { useLocalParticipant, useTracks } from "@livekit/components-react";
import { Track } from "livekit-client";
import {
    Mic, MicOff, Video as VideoOn, VideoOff, Loader2,
    FlipHorizontal,
} from "lucide-react";
import { api } from "@/lib/api";

/**
 * Premium host stage for the creator side of a LiveKit room.
 *
 *   - Local camera preview (mirrored).
 *   - Floating glassy mini-toolbar (mic, cam, flip) — bottom-center, contained
 *     inside the video frame so it never overlaps the surrounding UI.
 *   - "Connecting…" loader while the camera is publishing.
 *   - Captures a JPEG snapshot every 10 s and pushes it to the backend so
 *     fans see a recent live frame (instead of just the avatar) on the lobby.
 *
 * Replaces the default LiveKit `<VideoConference />` (which shipped without
 * stylesheet → giant unstyled buttons covering the host controls).
 */
export default function LiveHostStage({ sessionId }) {
    const { localParticipant, isMicrophoneEnabled, isCameraEnabled } = useLocalParticipant();
    const tracks = useTracks([Track.Source.Camera], { onlySubscribed: false });
    const localCam = tracks.find(
        (t) => t.participant?.isLocal && t.source === Track.Source.Camera,
    );
    const videoRef = useRef(null);
    const [busy, setBusy] = useState(false);
    const [facing, setFacing] = useState("user");
    const [canFlip, setCanFlip] = useState(false);

    // Detect whether the device has more than one camera → enables flip button.
    useEffect(() => {
        if (!navigator.mediaDevices?.enumerateDevices) return;
        navigator.mediaDevices.enumerateDevices()
            .then((list) => setCanFlip(list.filter((d) => d.kind === "videoinput").length > 1))
            .catch(() => setCanFlip(false));
    }, []);

    // Attach the local camera track to our <video> element.
    useEffect(() => {
        const track = localCam?.publication?.track;
        if (!track || !videoRef.current) return;
        track.attach(videoRef.current);
        return () => { try { track.detach(videoRef.current); } catch { /* ignore */ } };
    }, [localCam]);

    // Capture a small JPEG snapshot every 10 s and push it to the backend so
    // fans see a recent thumbnail on the lobby. We draw the actual <video>
    // frame onto a hidden <canvas> at low resolution + low quality to keep
    // the payload <50 KB.
    useEffect(() => {
        if (!sessionId || !isCameraEnabled) return;
        const tick = async () => {
            const v = videoRef.current;
            if (!v || v.readyState < 2 || !v.videoWidth) return;
            try {
                const TARGET_W = 320;
                const ratio = v.videoHeight / v.videoWidth;
                const w = TARGET_W;
                const h = Math.round(TARGET_W * ratio);
                const canvas = document.createElement("canvas");
                canvas.width = w; canvas.height = h;
                const ctx = canvas.getContext("2d");
                ctx.drawImage(v, 0, 0, w, h);
                const dataUrl = canvas.toDataURL("image/jpeg", 0.55);
                if (dataUrl.length > 280_000) return;  // safety cap
                await api.post(`/live/${sessionId}/snapshot`, { data_url: dataUrl });
            } catch { /* ignore snapshot errors */ }
        };
        const t = setTimeout(tick, 4000);          // first capture quickly
        const iv = setInterval(tick, 10000);       // then every 10 s
        return () => { clearTimeout(t); clearInterval(iv); };
    }, [sessionId, isCameraEnabled]);

    const toggleMic = async () => {
        if (!localParticipant || busy) return;
        setBusy(true);
        try { await localParticipant.setMicrophoneEnabled(!isMicrophoneEnabled); }
        finally { setBusy(false); }
    };

    const toggleCam = async () => {
        if (!localParticipant || busy) return;
        setBusy(true);
        try { await localParticipant.setCameraEnabled(!isCameraEnabled); }
        finally { setBusy(false); }
    };

    const flipCamera = async () => {
        if (!localParticipant || busy) return;
        setBusy(true);
        try {
            const next = facing === "user" ? "environment" : "user";
            await localParticipant.setCameraEnabled(false);
            const stream = await navigator.mediaDevices.getUserMedia({
                video: { facingMode: { ideal: next } },
                audio: false,
            });
            const track = stream.getVideoTracks()[0];
            if (track) {
                await localParticipant.publishTrack(track, { source: "camera" });
                setFacing(next);
            }
        } catch (e) {
            console.warn("flip camera failed", e);
        } finally {
            setBusy(false);
        }
    };

    return (
        <div className="absolute inset-0 bg-black" data-testid="live-host-stage">
            <video
                ref={videoRef}
                autoPlay
                muted
                playsInline
                className="h-full w-full bg-black object-contain"
                // Mirror the preview so the host sees themselves naturally.
                style={{ transform: facing === "user" ? "scaleX(-1)" : "none" }}
            />

            {!localCam && (
                <div className="pointer-events-none absolute inset-0 flex flex-col items-center justify-center gap-2 text-white/60" data-testid="live-host-stage-loading">
                    <Loader2 size={28} className="animate-spin text-magenta-300" />
                    <div className="text-sm font-semibold">Activation de la caméra…</div>
                </div>
            )}

            {/* Bottom-center mini toolbar — sits well above the goal bar so it
                never overlaps. Wrapped in a glass pill for a premium feel. */}
            <div
                className="absolute inset-x-0 bottom-16 z-20 flex items-center justify-center sm:bottom-20"
                data-testid="live-host-toolbar"
            >
                <div className="inline-flex items-center gap-2 rounded-full border border-white/15 bg-black/55 px-2 py-1.5 backdrop-blur-md shadow-[0_8px_24px_rgba(0,0,0,0.45)]">
                    <ToolbarBtn
                        active={isMicrophoneEnabled}
                        onClick={toggleMic}
                        disabled={busy}
                        testId="live-host-mic-btn"
                        ariaLabel={isMicrophoneEnabled ? "Couper le micro" : "Activer le micro"}
                        Icon={isMicrophoneEnabled ? Mic : MicOff}
                    />
                    <ToolbarBtn
                        active={isCameraEnabled}
                        onClick={toggleCam}
                        disabled={busy}
                        testId="live-host-cam-btn"
                        ariaLabel={isCameraEnabled ? "Couper la caméra" : "Activer la caméra"}
                        Icon={isCameraEnabled ? VideoOn : VideoOff}
                    />
                    {canFlip && (
                        <ToolbarBtn
                            active
                            onClick={flipCamera}
                            disabled={busy}
                            testId="live-host-flip-btn"
                            ariaLabel="Basculer caméra"
                            Icon={FlipHorizontal}
                        />
                    )}
                </div>
            </div>
        </div>
    );
}

function ToolbarBtn({ active, onClick, disabled, testId, ariaLabel, Icon }) {
    return (
        <button
            type="button"
            onClick={onClick}
            disabled={disabled}
            data-testid={testId}
            aria-label={ariaLabel}
            className={`group relative inline-flex h-10 w-10 items-center justify-center rounded-full transition-all duration-200 ${
                active
                    ? "bg-white/10 text-white hover:bg-white/15 hover:scale-105"
                    : "bg-red-500/40 text-red-50 hover:bg-red-500/60 hover:scale-105"
            } disabled:opacity-50 disabled:cursor-not-allowed`}
        >
            <Icon size={16} />
            {!active && (
                <span className="absolute inset-0 rounded-full ring-2 ring-red-400/50 animate-pulseRing pointer-events-none" />
            )}
        </button>
    );
}
