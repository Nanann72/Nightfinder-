import { forwardRef, useEffect, useRef } from "react";

/**
 * ProtectedImage
 * ---------------
 * Wraps an `<img>` with aggressive anti-copy / anti-save measures, so that
 * casual attempts to rip a paid image (long-press, right-click, drag-to-save,
 * copy-image address) are blocked.
 *
 * What we block:
 *  - Native context menu (right-click / long-press on desktop)
 *  - iOS Safari "Save image" callout (`-webkit-touch-callout: none`)
 *  - Text / image selection (`user-select: none`)
 *  - Native drag-and-drop (returns false on `dragstart`)
 *  - Direct pointer access to the <img> via a transparent overlay on top so
 *    right-click + long-press target the overlay instead of the image.
 *
 * What we can't block (OS-level): device screenshots, screen recording.
 * We combat those via server-side user-specific watermarking.
 */
const ProtectedImage = forwardRef(function ProtectedImage(
    { src, alt = "", className = "", style = {}, testId, ...rest },
    ref
) {
    const innerRef = useRef(null);
    const setRefs = (el) => {
        innerRef.current = el;
        if (typeof ref === "function") ref(el);
        else if (ref && typeof ref === "object") ref.current = el;
    };

    // Block keyboard shortcuts (Cmd/Ctrl+S, Cmd/Ctrl+Shift+S) when focused in this subtree
    useEffect(() => {
        const onKey = (e) => {
            const key = (e.key || "").toLowerCase();
            if ((e.ctrlKey || e.metaKey) && (key === "s" || key === "p" || key === "u")) {
                e.preventDefault();
            }
        };
        window.addEventListener("keydown", onKey, { capture: true });
        return () => window.removeEventListener("keydown", onKey, { capture: true });
    }, []);

    const stop = (e) => { e.preventDefault(); e.stopPropagation(); return false; };

    return (
        <div
            className={`relative select-none ${className}`}
            style={{
                WebkitUserSelect: "none",
                userSelect: "none",
                WebkitTouchCallout: "none",
                WebkitTapHighlightColor: "transparent",
                ...style,
            }}
            onContextMenu={stop}
            onDragStart={stop}
            onDrop={stop}
            data-testid={testId}
        >
            <img
                ref={setRefs}
                src={src}
                alt={alt}
                draggable={false}
                onContextMenu={stop}
                onDragStart={stop}
                onCopy={stop}
                onCut={stop}
                onMouseDown={(e) => { if (e.button === 2) stop(e); }}
                style={{
                    WebkitUserDrag: "none",
                    WebkitUserSelect: "none",
                    userSelect: "none",
                    WebkitTouchCallout: "none",
                    pointerEvents: "none", // overlay intercepts pointer events
                }}
                className="block h-full w-full object-cover"
                {...rest}
            />
            {/* Transparent overlay — absorbs long-press/right-click instead of the <img> */}
            <div
                aria-hidden="true"
                onContextMenu={stop}
                onDragStart={stop}
                className="absolute inset-0"
                style={{
                    background: "transparent",
                    WebkitTouchCallout: "none",
                    WebkitUserSelect: "none",
                    userSelect: "none",
                    cursor: "default",
                }}
            />
        </div>
    );
});

export default ProtectedImage;
