import { useState } from "react";
import { api } from "@/lib/api";
import { Upload, Loader2 } from "lucide-react";

export const BACKEND_URL = process.env.REACT_APP_BACKEND_URL;

const MAX_BYTES = 2 * 1024 * 1024 * 1024; // 2 GB

/** A reusable file input that uploads to /api/upload (GridFS-backed).
 * Supports files up to 2 GB with live progress. */
export default function FileUploader({ value, onChange, accept = "image/*,video/*",
                                       label = "Choisir un fichier", testId = "file-uploader" }) {
    const [loading, setLoading] = useState(false);
    const [progress, setProgress] = useState(0);
    const [err, setErr] = useState("");

    const onFile = async (e) => {
        const f = e.target.files?.[0];
        if (!f) return;
        if (f.size > MAX_BYTES) {
            setErr(`Fichier trop volumineux (${(f.size / 1024 / 1024).toFixed(0)} MB). Max 2 GB.`);
            e.target.value = "";
            return;
        }
        setErr(""); setLoading(true); setProgress(0);
        try {
            const fd = new FormData();
            fd.append("file", f);
            const { data } = await api.post("/upload", fd, {
                headers: { "Content-Type": "multipart/form-data" },
                timeout: 0, // No client-side timeout for very large files
                onUploadProgress: (evt) => {
                    if (evt.total) setProgress(Math.round((evt.loaded / evt.total) * 100));
                },
            });
            const absolute = data.url.startsWith("http") ? data.url : `${BACKEND_URL}${data.url}`;
            onChange?.(absolute);
        } catch (e) {
            setErr(e.response?.data?.detail || "Échec de l'upload");
        } finally {
            setLoading(false);
            setProgress(0);
            e.target.value = "";
        }
    };

    return (
        <div>
            <label
                htmlFor={`${testId}-input`}
                className="flex cursor-pointer items-center justify-center gap-2 rounded-xl border border-dashed border-white/15 bg-white/[0.02] px-4 py-6 text-sm text-white/60 transition-all hover:border-magenta/40 hover:bg-magenta/5 hover:text-white"
                data-testid={testId}
            >
                {loading ? <Loader2 className="animate-spin" size={16} /> : <Upload size={16} />}
                {loading ? (progress > 0 ? `Téléversement · ${progress}%` : "Téléversement…") : label}
                <input
                    id={`${testId}-input`}
                    type="file"
                    accept={accept}
                    onChange={onFile}
                    className="sr-only"
                    data-testid={`${testId}-file`}
                />
            </label>
            {loading && progress > 0 && (
                <div className="mt-2 h-1.5 w-full overflow-hidden rounded-full bg-white/5" data-testid={`${testId}-progress`}>
                    <div className="h-full rounded-full bg-magenta transition-all" style={{ width: `${progress}%` }} />
                </div>
            )}
            {value && (
                <div className="mt-3 overflow-hidden rounded-xl border border-white/10">
                    {/\.(mp4|webm|mov)(\?|$)/i.test(value) ? (
                        <video src={value} controls className="w-full max-h-60 bg-black" />
                    ) : (
                        <img src={value} alt="" className="w-full max-h-60 object-cover" />
                    )}
                </div>
            )}
            {err && <div className="mt-2 text-xs text-red-300" data-testid={`${testId}-error`}>{err}</div>}
        </div>
    );
}
