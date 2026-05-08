import { useEffect, useRef, useState } from "react";
import { api } from "@/lib/api";
import { Mic, Square, Trash2, Loader2 } from "lucide-react";

const MAX_SECONDS = 120;

function fmt(t) {
    const m = Math.floor(t / 60);
    const s = Math.floor(t % 60).toString().padStart(2, "0");
    return `${m}:${s}`;
}

/**
 * VoiceRecorder — captures audio via MediaRecorder, uploads on stop, returns
 * { url, duration } via onUploaded(). Caps at 120 s. Shows a tiny waveform-like
 * timer pulse while recording, and an inline player + retake button after capture.
 */
export default function VoiceRecorder({ onUploaded, onCancel }) {
    const [status, setStatus] = useState("idle"); // idle | recording | uploading | ready | error
    const [seconds, setSeconds] = useState(0);
    const [previewUrl, setPreviewUrl] = useState("");
    const [error, setError] = useState("");
    const recorderRef = useRef(null);
    const chunksRef = useRef([]);
    const streamRef = useRef(null);
    const timerRef = useRef(null);
    const startedAtRef = useRef(0);

    useEffect(() => () => stopAll(), []);

    const stopAll = () => {
        try { if (timerRef.current) clearInterval(timerRef.current); } catch {}
        try { recorderRef.current?.state === "recording" && recorderRef.current.stop(); } catch {}
        try { streamRef.current?.getTracks().forEach(t => t.stop()); } catch {}
    };

    const start = async () => {
        setError("");
        try {
            const stream = await navigator.mediaDevices.getUserMedia({ audio: true });
            streamRef.current = stream;
            // Pick best supported mime
            const candidates = [
                "audio/webm;codecs=opus",
                "audio/webm",
                "audio/mp4",
                "audio/ogg;codecs=opus",
            ];
            let mime = "";
            for (const m of candidates) {
                if (typeof MediaRecorder !== "undefined" && MediaRecorder.isTypeSupported?.(m)) { mime = m; break; }
            }
            const rec = mime ? new MediaRecorder(stream, { mimeType: mime }) : new MediaRecorder(stream);
            recorderRef.current = rec;
            chunksRef.current = [];
            rec.ondataavailable = (e) => { if (e.data && e.data.size > 0) chunksRef.current.push(e.data); };
            rec.onstop = async () => {
                const blob = new Blob(chunksRef.current, { type: rec.mimeType || "audio/webm" });
                const dur = Math.max(1, Math.round((Date.now() - startedAtRef.current) / 1000));
                streamRef.current?.getTracks().forEach(t => t.stop());
                await uploadBlob(blob, dur);
            };
            rec.start();
            startedAtRef.current = Date.now();
            setStatus("recording");
            setSeconds(0);
            timerRef.current = setInterval(() => {
                setSeconds(prev => {
                    const next = prev + 1;
                    if (next >= MAX_SECONDS) { stop(); }
                    return next;
                });
            }, 1000);
        } catch (e) {
            setError("Micro inaccessible. Vérifie les autorisations du navigateur.");
            setStatus("error");
        }
    };

    const stop = () => {
        try { if (timerRef.current) clearInterval(timerRef.current); } catch {}
        try { recorderRef.current?.state === "recording" && recorderRef.current.stop(); } catch {}
        setStatus("uploading");
    };

    const uploadBlob = async (blob, duration) => {
        try {
            const ext = blob.type.includes("mp4") ? "m4a"
                      : blob.type.includes("ogg") ? "ogg"
                      : "webm";
            const file = new File([blob], `voice_${Date.now()}.${ext}`, { type: blob.type });
            const fd = new FormData();
            fd.append("file", file);
            const { data } = await api.post("/upload", fd, { headers: { "Content-Type": "multipart/form-data" } });
            setPreviewUrl(data.url);
            setStatus("ready");
            onUploaded?.({ url: data.url, duration });
        } catch (e) {
            setError("Envoi impossible. Réessaie.");
            setStatus("error");
        }
    };

    const reset = () => {
        setPreviewUrl("");
        setSeconds(0);
        setStatus("idle");
        setError("");
        chunksRef.current = [];
        onUploaded?.(null);
    };

    if (status === "idle") {
        return (
            <button
                type="button"
                onClick={start}
                data-testid="voice-record-start"
                className="rounded-full border border-white/10 bg-white/[0.03] p-2 text-white/70 hover:border-magenta/40 hover:text-magenta-200"
                title="Enregistrer un message vocal (max 2 min)"
            >
                <Mic size={16} />
            </button>
        );
    }

    if (status === "recording") {
        return (
            <div className="flex items-center gap-3 rounded-full border border-magenta/40 bg-magenta/10 px-3 py-1.5" data-testid="voice-recording-bar">
                <span className="relative flex h-2 w-2">
                    <span className="absolute inset-0 animate-ping rounded-full bg-magenta opacity-75" />
                    <span className="relative h-2 w-2 rounded-full bg-magenta" />
                </span>
                <span className="font-mono text-xs text-magenta-200" data-testid="voice-timer">{fmt(seconds)} / 2:00</span>
                <button
                    type="button"
                    onClick={stop}
                    data-testid="voice-record-stop"
                    className="ml-2 inline-flex items-center gap-1 rounded-full bg-magenta px-3 py-1 text-[11px] font-semibold text-white hover:bg-magenta-400"
                >
                    <Square size={11} /> Stop
                </button>
                <button
                    type="button"
                    onClick={() => { stopAll(); reset(); onCancel?.(); }}
                    data-testid="voice-record-cancel"
                    className="rounded-full p-1 text-white/60 hover:bg-white/5"
                >
                    <Trash2 size={13} />
                </button>
            </div>
        );
    }

    if (status === "uploading") {
        return (
            <div className="flex items-center gap-2 rounded-full border border-white/10 bg-white/[0.04] px-3 py-1.5 text-xs text-white/70">
                <Loader2 size={13} className="animate-spin" /> Envoi du vocal…
            </div>
        );
    }

    if (status === "ready") {
        return (
            <div className="flex flex-1 items-center gap-2 rounded-full border border-magenta/30 bg-magenta/5 px-2 py-1" data-testid="voice-preview">
                <audio src={previewUrl} controls className="h-8 flex-1 min-w-0" />
                <button
                    type="button"
                    onClick={reset}
                    data-testid="voice-record-discard"
                    className="rounded-full p-1.5 text-white/60 hover:bg-white/5 hover:text-red-300"
                    title="Recommencer"
                >
                    <Trash2 size={14} />
                </button>
            </div>
        );
    }

    return (
        <div className="text-xs text-red-300" data-testid="voice-record-error">
            {error}
            <button type="button" onClick={reset} className="ml-2 underline">Réessayer</button>
        </div>
    );
}
