import { useMemo, useRef } from "react";
import { PanResponder, type GestureResponderHandlers } from "react-native";

/**
 * Horizontal swipe on a photo (threshold 60 dp or 30 % of its width) plus an optional
 * double-tap. Vertical drags are left to the scroll view around it. `next` is a swipe to the left.
 */
export function useSwipe({ width, next, prev, doubleTap }: { width: number; next?: () => void; prev?: () => void; doubleTap?: () => void }): GestureResponderHandlers {
  const lastTap = useRef(0);
  const h = useRef({ next, prev, doubleTap, width });
  h.current = { next, prev, doubleTap, width };
  return useMemo(() => PanResponder.create({
    onStartShouldSetPanResponder: () => !!h.current.doubleTap,
    onMoveShouldSetPanResponder: (_, g) => Math.abs(g.dx) > 12 && Math.abs(g.dx) > Math.abs(g.dy) * 1.5,
    onPanResponderTerminationRequest: () => true,
    onPanResponderRelease: (_, g) => {
      const threshold = Math.min(60, h.current.width * 0.3);
      if (g.dx <= -threshold) { h.current.next?.(); return; }
      if (g.dx >= threshold) { h.current.prev?.(); return; }
      if (Math.abs(g.dx) < 8 && Math.abs(g.dy) < 8 && h.current.doubleTap) {
        const now = Date.now();
        if (now - lastTap.current < 300) { lastTap.current = 0; h.current.doubleTap(); } else lastTap.current = now;
      }
    },
  }).panHandlers, []);
}
