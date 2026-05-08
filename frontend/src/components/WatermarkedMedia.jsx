import { useWatermarkedImage } from "@/lib/watermark";
import { Shield } from "lucide-react";

/**
 * Displays a paid media URL, adding a diagonal watermark with the current user's handle
 * when `watermark` is true and the file is an image.
 */
export default function WatermarkedMedia({ src, watermark = true, testId }) {
    const displayUrl = useWatermarkedImage(src, watermark);
    if (!src) return null;
    const isVideo = /\.(mp4|webm|mov|m4v|avi)(\?|$)/i.test(src);
    if (isVideo) {
        return (
            <div className="relative overflow-hidden rounded-xl border border-white/10">
                <video src={src} controls className="w-full max-h-80 bg-black" data-testid={testId} />
            </div>
        );
    }
    return (
        <div className="relative overflow-hidden rounded-xl border border-white/10">
            <img src={displayUrl || src} alt="" className="w-full max-h-80 object-cover" data-testid={testId} />
            {watermark && (
                <div className="pointer-events-none absolute top-2 right-2 inline-flex items-center gap-1 rounded-full border border-white/20 bg-black/60 px-2 py-0.5 text-[10px] text-white/80" title="Image filigranée pour prévenir les fuites">
                    <Shield size={10} /> Protégé
                </div>
            )}
        </div>
    );
}
