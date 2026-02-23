import { useEffect, useRef, useState } from "react";

export const useLoadingReveal = (loading: boolean, durationMs = 220) => {
  const previousLoadingRef = useRef(loading);
  const [revealing, setRevealing] = useState(false);

  useEffect(() => {
    const wasLoading = previousLoadingRef.current;
    previousLoadingRef.current = loading;

    if (!wasLoading || loading) return;

    setRevealing(true);
    const timeoutId = window.setTimeout(() => {
      setRevealing(false);
    }, durationMs);

    return () => {
      window.clearTimeout(timeoutId);
    };
  }, [durationMs, loading]);

  return revealing;
};

