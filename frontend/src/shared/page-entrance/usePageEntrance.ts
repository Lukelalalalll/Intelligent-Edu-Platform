import { useEffect, useState } from "react";

export const PAGE_ENTRANCE_DURATION_MS = 560;
export const PAGE_ENTRANCE_SETTLE_MS = PAGE_ENTRANCE_DURATION_MS + 60;

export function usePageEntrance() {
  const [isEntranceActive, setIsEntranceActive] = useState(true);

  useEffect(() => {
    if (typeof window === "undefined") {
      return;
    }

    const motionQuery = window.matchMedia?.("(prefers-reduced-motion: reduce)");
    if (motionQuery?.matches) {
      setIsEntranceActive(false);
      return;
    }

    const timeoutId = window.setTimeout(() => {
      setIsEntranceActive(false);
    }, PAGE_ENTRANCE_SETTLE_MS);

    return () => {
      window.clearTimeout(timeoutId);
    };
  }, []);

  return isEntranceActive;
}
