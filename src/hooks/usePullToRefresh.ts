import { useEffect, useRef } from "react";

export function usePullToRefresh(onRefresh: () => void, threshold = 80) {
  const startY = useRef(0);
  const pulling = useRef(false);

  useEffect(() => {
    const handleTouchStart = (e: TouchEvent) => {
      if (window.scrollY === 0) {
        startY.current = e.touches[0].clientY;
        pulling.current = true;
      }
    };

    const handleTouchEnd = (e: TouchEvent) => {
      if (!pulling.current) return;
      const delta = e.changedTouches[0].clientY - startY.current;
      if (delta > threshold) onRefresh();
      pulling.current = false;
    };

    document.addEventListener("touchstart", handleTouchStart, { passive: true });
    document.addEventListener("touchend", handleTouchEnd, { passive: true });
    return () => {
      document.removeEventListener("touchstart", handleTouchStart);
      document.removeEventListener("touchend", handleTouchEnd);
    };
  }, [onRefresh, threshold]);
}
