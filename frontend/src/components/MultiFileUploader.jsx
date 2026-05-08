import { useCallback, useState } from "react";
import { Upload, Loader2, CheckCircle2, AlertCircle, X, Plus } from "lucide-react";
import { api } from "@/lib/api";

export const BACKEND_URL = process.env.REACT_APP_BACKEND_URL;
const MAX_BYTES = 2 * 1024 * 1024 * 1024; // 2 GB
const MAX_PARALLEL = 2; // concurrent uploads

/**
 * Bulk file uploader for creators.
 * - Accepts multiple images/videos
 * - Uploads 2 in parallel with individual progress + per-file error surfacing
 * - Exposes the list of successfully-uploaded {url, name, is_video} items via `onAllDone`
 * - Each success calls `onItemDone({url, name, size, is_video})` so parent can create a post immediately
 */
export default function MultiFileUploader({
    onItemDone,
    onAllDone,
    accept = "image/*,video/*",
    maxBytes = MAX_BYTES,
    testId = "multi-uploader",
    disabled = false,
}) {
    const [items, setItems] = useState([]); // {id, name, size, progress, status:'queued'|'uploading'|'done'|'error', url?, error?}
    const [busy, setBusy] = useState(false);

    const handlePick = useCallback((e) => {
        const files = Array.from(e.target.files || []);
        if (!files.length) return;
        const queued = files.map((f, i) => ({
            id: `u_${Date.now()}_${i}_${Math.random().toString(36).slice(2, 6)}`,
            name: f.name,
            size: f.size,
            file: f,
            progress: 0,
            status: f.size > maxBytes ? "error" : "queued",
            error: f.size > maxBytes ? `Trop volumineux (${(f.size / 1024 / 1024).toFixed(0)} MB > max 2 GB)` : null,
        }));
        setItems((prev) => [...prev, ...queued]);
        e.target.value = "";
        // Kick the queue
        setTimeout(() => processQueue(), 50);
    // eslint-disable-next-line react-hooks/exhaustive-deps
    }, [maxBytes]);

    const uploadOne = useCallback(async (item) => {
        setItems((prev) => prev.map((x) => x.id === item.id ? { ...x, status: "uploading", progress: 0, error: null } : x));
        try {
            const fd = new FormData();
            fd.append("file", item.file);
            const { data } = await api.post("/upload", fd, {
                headers: { "Content-Type": "multipart/form-data" },
                timeout: 0,
                onUploadProgress: (evt) => {
                    if (evt.total) {
                        const p = Math.round((evt.loaded / evt.total) * 100);
                        setItems((prev) => prev.map((x) => x.id === item.id ? { ...x, progress: p } : x));
                    }
                },
            });
            const isVideo = /\.(mp4|webm|mov|avi|mkv)$/i.test(item.name) || (item.file.type || "").startsWith("video/");
            const absolute = data.url.startsWith("http") ? data.url : `${BACKEND_URL}${data.url}`;
            setItems((prev) => prev.map((x) => x.id === item.id ? { ...x, status: "done", progress: 100, url: absolute, is_video: isVideo } : x));
            onItemDone?.({ url: absolute, name: item.name, size: item.size, is_video: isVideo });
        } catch (e) {
            const msg = e.response?.data?.detail || e.message || "Échec";
            setItems((prev) => prev.map((x) => x.id === item.id ? { ...x, status: "error", error: typeof msg === "string" ? msg : "Échec" } : x));
        }
    }, [onItemDone]);

    const processQueue = useCallback(async () => {
        setBusy(true);
        // Loop until no queued items left
        while (true) {
            // Snapshot current state
            const snapshot = await new Promise((resolve) => {
                setItems((prev) => { resolve(prev); return prev; });
            });
            const queued = snapshot.filter((x) => x.status === "queued");
            if (queued.length === 0) break;
            const active = snapshot.filter((x) => x.status === "uploading").length;
            const slots = Math.max(0, MAX_PARALLEL - active);
            if (slots === 0) {
                await new Promise((r) => setTimeout(r, 300));
                continue;
            }
            const batch = queued.slice(0, slots);
            await Promise.all(batch.map(uploadOne));
        }
        setBusy(false);
        // All done? Fire callback
        const final = await new Promise((resolve) => setItems((prev) => { resolve(prev); return prev; }));
        const successes = final.filter((x) => x.status === "done").map((x) => ({ url: x.url, name: x.name, is_video: x.is_video }));
        if (successes.length) onAllDone?.(successes);
    }, [uploadOne, onAllDone]);

    const removeItem = (id) => setItems((prev) => prev.filter((x) => x.id !== id));
    const clearDone = () => setItems((prev) => prev.filter((x) => x.status !== "done"));

    const doneCount = items.filter((x) => x.status === "done").length;
    const errorCount = items.filter((x) => x.status === "error").length;

    return (
        <div data-testid={testId}>
            <label
                htmlFor={`${testId}-input`}
                className={`flex flex-col items-center justify-center gap-2 rounded-xl border border-dashed border-white/15 bg-white/[0.02] px-4 py-8 text-sm text-white/60 transition-all hover:border-magenta/40 hover:bg-magenta/5 hover:text-white ${disabled ? "cursor-not-allowed opacity-50" : "cursor-pointer"}`}
            >
                {busy ? <Loader2 className="animate-spin text-magenta-200" size={22} /> : <Upload size={22} />}
                <div className="text-center">
                    <div className="font-semibold">{busy ? "Téléversement en cours…" : "Glisse ou clique pour ajouter plusieurs fichiers"}</div>
                    <div className="mt-0.5 text-[11px] text-white/40">Photos et vidéos · jusqu'à 2 GB par fichier · upload simultané x{MAX_PARALLEL}</div>
                </div>
                <input
                    id={`${testId}-input`}
                    type="file"
                    accept={accept}
                    multiple
                    onChange={handlePick}
                    disabled={disabled}
                    className="sr-only"
                    data-testid={`${testId}-file`}
                />
            </label>

            {items.length > 0 && (
                <div className="mt-3 space-y-2" data-testid={`${testId}-list`}>
                    <div className="flex items-center justify-between text-[11px] text-white/50">
                        <span>{items.length} fichier{items.length > 1 ? "s" : ""} · <span className="text-green-300">{doneCount} ok</span>{errorCount > 0 ? <> · <span className="text-red-300">{errorCount} erreur{errorCount > 1 ? "s" : ""}</span></> : null}</span>
                        {doneCount > 0 && (
                            <button type="button" onClick={clearDone}
                                    data-testid={`${testId}-clear-done`}
                                    className="rounded-full border border-white/10 bg-white/[0.03] px-2 py-0.5 text-[10px] hover:bg-white/[0.08]">Nettoyer terminés</button>
                        )}
                    </div>
                    {items.map((item) => (
                        <div key={item.id}
                             data-testid={`${testId}-item-${item.id}`}
                             className={`rounded-lg border p-2.5 ${
                                item.status === "done" ? "border-green-500/30 bg-green-500/5" :
                                item.status === "error" ? "border-red-500/30 bg-red-500/5" :
                                item.status === "uploading" ? "border-magenta/30 bg-magenta/5" :
                                "border-white/10 bg-white/[0.02]"
                             }`}>
                            <div className="flex items-center justify-between gap-2">
                                <div className="flex items-center gap-2 min-w-0">
                                    {item.status === "done" && <CheckCircle2 size={14} className="shrink-0 text-green-400" />}
                                    {item.status === "error" && <AlertCircle size={14} className="shrink-0 text-red-400" />}
                                    {item.status === "uploading" && <Loader2 size={14} className="shrink-0 animate-spin text-magenta-300" />}
                                    {item.status === "queued" && <Plus size={14} className="shrink-0 text-white/40" />}
                                    <div className="min-w-0">
                                        <div className="truncate text-xs font-semibold">{item.name}</div>
                                        <div className="text-[10px] text-white/40">
                                            {(item.size / 1024 / 1024).toFixed(1)} MB
                                            {item.status === "uploading" && ` · ${item.progress}%`}
                                            {item.status === "error" && item.error && ` · ${item.error}`}
                                        </div>
                                    </div>
                                </div>
                                {item.status !== "uploading" && (
                                    <button type="button" onClick={() => removeItem(item.id)}
                                            data-testid={`${testId}-remove-${item.id}`}
                                            aria-label="Retirer"
                                            className="shrink-0 rounded-full p-1 text-white/40 hover:bg-white/5 hover:text-white">
                                        <X size={12} />
                                    </button>
                                )}
                            </div>
                            {item.status === "uploading" && (
                                <div className="mt-2 h-1 w-full overflow-hidden rounded-full bg-white/5">
                                    <div className="h-full rounded-full bg-magenta transition-all" style={{ width: `${item.progress}%` }} />
                                </div>
                            )}
                        </div>
                    ))}
                </div>
            )}
        </div>
    );
}
