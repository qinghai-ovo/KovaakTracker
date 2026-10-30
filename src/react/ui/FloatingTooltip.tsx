import { type ReactNode, useCallback, useEffect, useRef, useState } from "react";
import { createPortal } from "react-dom";

type TooltipPlacement = "top" | "right" | "bottom" | "left";

interface FloatingTooltipProps {
  children: ReactNode;
  content: ReactNode;
  placement?: TooltipPlacement;
  wrapperClassName?: string;
}

interface FloatingPosition {
  left: number;
  top: number;
}

const tooltipGap = 10;
const viewportPadding = 12;

export function FloatingTooltip({ children, content, placement = "top", wrapperClassName = "" }: FloatingTooltipProps) {
  const anchorRef = useRef<HTMLSpanElement>(null);
  const tooltipRef = useRef<HTMLDivElement>(null);
  const [open, setOpen] = useState(false);
  const [position, setPosition] = useState<FloatingPosition>({ left: 0, top: 0 });

  const updatePosition = useCallback(() => {
    const anchor = anchorRef.current;
    const tooltip = tooltipRef.current;
    if (!anchor || !tooltip) return;
    setPosition(calculateFloatingPosition(anchor.getBoundingClientRect(), tooltip.getBoundingClientRect(), placement));
  }, [placement]);

  useEffect(() => {
    if (!open) return;
    updatePosition();
    window.addEventListener("resize", updatePosition);
    window.addEventListener("scroll", updatePosition, true);
    return () => {
      window.removeEventListener("resize", updatePosition);
      window.removeEventListener("scroll", updatePosition, true);
    };
  }, [open, updatePosition]);

  return (
    <span
      className={["floating-tooltip-anchor", wrapperClassName].filter(Boolean).join(" ")}
      onMouseEnter={() => setOpen(true)}
      onMouseLeave={() => setOpen(false)}
      onFocus={() => setOpen(true)}
      onBlur={() => setOpen(false)}
      ref={anchorRef}
    >
      {children}
      {open
        ? createPortal(
            <div className="floating-tooltip-layer" ref={tooltipRef} role="tooltip" style={{ left: position.left, top: position.top }}>
              {content}
            </div>,
            document.body,
          )
        : null}
    </span>
  );
}

function calculateFloatingPosition(anchor: DOMRect, tooltip: DOMRect, placement: TooltipPlacement): FloatingPosition {
  const candidates = [
    placement,
    placement === "top" ? "bottom" : placement === "bottom" ? "top" : placement === "left" ? "right" : "left",
    "top",
    "bottom",
    "right",
    "left",
  ] as TooltipPlacement[];
  const uniqueCandidates = [...new Set(candidates)];
  const best = uniqueCandidates
    .map((candidate) => place(anchor, tooltip, candidate))
    .map((position) => clampPosition(position, tooltip))
    .sort((a, b) => a.overflow - b.overflow)[0];
  return { left: best.left, top: best.top };
}

function place(anchor: DOMRect, tooltip: DOMRect, placement: TooltipPlacement): FloatingPosition & { overflow: number } {
  if (placement === "right") {
    return {
      left: anchor.right + tooltipGap,
      top: anchor.top + (anchor.height - tooltip.height) / 2,
      overflow: 0,
    };
  }
  if (placement === "left") {
    return {
      left: anchor.left - tooltip.width - tooltipGap,
      top: anchor.top + (anchor.height - tooltip.height) / 2,
      overflow: 0,
    };
  }
  if (placement === "bottom") {
    return {
      left: anchor.left + (anchor.width - tooltip.width) / 2,
      top: anchor.bottom + tooltipGap,
      overflow: 0,
    };
  }
  return {
    left: anchor.left + (anchor.width - tooltip.width) / 2,
    top: anchor.top - tooltip.height - tooltipGap,
    overflow: 0,
  };
}

function clampPosition(position: FloatingPosition & { overflow: number }, tooltip: DOMRect): FloatingPosition & { overflow: number } {
  const maxLeft = window.innerWidth - tooltip.width - viewportPadding;
  const maxTop = window.innerHeight - tooltip.height - viewportPadding;
  const left = Math.min(Math.max(viewportPadding, position.left), Math.max(viewportPadding, maxLeft));
  const top = Math.min(Math.max(viewportPadding, position.top), Math.max(viewportPadding, maxTop));
  return {
    left,
    top,
    overflow: Math.abs(left - position.left) + Math.abs(top - position.top),
  };
}
