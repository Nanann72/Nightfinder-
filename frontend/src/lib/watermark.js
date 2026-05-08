import { useEffect, useState } from "react";
import { api, BACKEND_URL } from "@/lib/api";

/**
 * Returns a watermarked image URL for the given `src` (when user is authenticated).
 * - If `enabled` is false or `src` is empty → returns `src` unchanged.
 * - Videos are returned unchanged (watermarking video is out of scope).
 * - On backend error, falls back to the original URL.
 */
export function useWatermarkedImage(src, enabled = true) {
    const [url, setUrl] = useState(src || "");

    useEffect(() => {
        if (!src || !enabled) { setUrl(src || ""); return; }
        if (/\.(mp4|webm|mov|m4v|avi)(\?|$)/i.test(src)) { setUrl(src); return; }
        let cancelled = false;
        (async () => {
            try {
                const { data } = await api.post("/media/wm-url", { src });
                if (!cancelled) setUrl(`${BACKEND_URL}${data.path}`);
            } catch {
                if (!cancelled) setUrl(src);
            }
        })();
        return () => { cancelled = true; };
    }, [src, enabled]);

    return url;
}
