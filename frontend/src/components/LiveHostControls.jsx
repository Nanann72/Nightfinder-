import {
    useLocalParticipant,
    useConnectionState,
    useConnectionQualityIndicator,
} from "@livekit/components-react";
import { ConnectionState, ConnectionQuality } from "livekit-client";
import { WifiOff, Activity } from "lucide-react";

const QUALITY_LABEL = {
    [ConnectionQuality.Excellent]: { label: "Excellente", color: "text-green-400 border-green-400/40" },
    [ConnectionQuality.Good]:      { label: "Bonne",      color: "text-green-300 border-green-400/30" },
    [ConnectionQuality.Poor]:      { label: "Faible",     color: "text-amber-300 border-amber-400/40" },
    [ConnectionQuality.Lost]:      { label: "Perdue",     color: "text-red-400 border-red-400/40" },
};

/**
 * Compact connection-quality pill, anchored top-left of the host stage.
 * Camera flip lives on `LiveHostStage` toolbar instead, so this component
 * stays small and doesn't fight for pointer events.
 */
export default function LiveHostControls() {
    const { localParticipant } = useLocalParticipant();
    const state = useConnectionState();
    const { quality } = useConnectionQualityIndicator({ participant: localParticipant });
    const q = QUALITY_LABEL[quality] || { label: "…", color: "text-white/40 border-white/10" };
    const connected = state === ConnectionState.Connected;
    return (
        <div
            data-testid="live-quality-badge"
            className={`pointer-events-none absolute left-3 top-3 z-20 inline-flex items-center gap-1.5 rounded-full border bg-black/60 px-2.5 py-1 text-[11px] font-semibold backdrop-blur-md ${q.color}`}
        >
            {connected ? <Activity size={11} /> : <WifiOff size={11} />}
            {connected ? q.label : "Reconnexion…"}
        </div>
    );
}
