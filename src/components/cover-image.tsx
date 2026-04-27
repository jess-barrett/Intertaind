"use client";

import { useEffect, useState } from "react";

/**
 * Cover image with a Google Books fallback: if the zoom=3 URL fails (common
 * for thin-record volumes that only have zoom=1), retry once at zoom=1
 * before giving up and showing the fallback node.
 */
export default function CoverImage({
  src,
  alt,
  className,
  fallback,
}: {
  src: string | null | undefined;
  alt: string;
  className?: string;
  fallback: React.ReactNode;
}) {
  const [url, setUrl] = useState(src);
  const [failed, setFailed] = useState(false);

  // Re-sync the internal state when the `src` prop changes — without
  // this, a router.refresh() that flows a new cover URL down (e.g.
  // after the cover-picker modal saves a custom cover) would render
  // with the new prop but keep showing the stale state's URL.
  useEffect(() => {
    setUrl(src);
    setFailed(false);
  }, [src]);

  function tryZoomFallback(current: string): boolean {
    if (/books\.google\.com.+zoom=3/.test(current)) {
      setUrl(current.replace(/zoom=3/, "zoom=1"));
      return true;
    }
    return false;
  }

  function handleError() {
    if (url && tryZoomFallback(url)) return;
    setFailed(true);
  }

  // Google sometimes returns a 200 with a tiny placeholder image (no onError).
  // Detect this by checking loaded dimensions.
  function handleLoad(e: React.SyntheticEvent<HTMLImageElement>) {
    const img = e.currentTarget;
    if (img.naturalWidth > 0 && img.naturalWidth < 50 && url) {
      if (tryZoomFallback(url)) return;
      setFailed(true);
    }
  }

  if (!url || failed) return <>{fallback}</>;

  return (
    <img
      src={url}
      alt={alt}
      className={className}
      loading="lazy"
      onError={handleError}
      onLoad={handleLoad}
      referrerPolicy="no-referrer"
    />
  );
}
