/** Load the first loadable logo URL cross-origin and rasterize it to a PNG data URL.
 *  Best-effort: resolves null if the list is empty, nothing loads, or the canvas is
 *  CORS-tainted. Ported from legacy app.html deriveLogoFromUrls. Browser-only (uses Image/canvas). */
export function deriveLogoFromUrls(urls: string[]): Promise<string | null> {
  return new Promise((resolve) => {
    const list = (urls || []).filter(Boolean);
    let i = 0;
    const tryNext = () => {
      if (i >= list.length) return resolve(null);
      const u = list[i++];
      const img = new Image();
      img.crossOrigin = "anonymous";
      img.onload = () => {
        try {
          const c = document.createElement("canvas");
          c.width = img.naturalWidth || 256;
          c.height = img.naturalHeight || 256;
          const ctx = c.getContext("2d");
          if (!ctx) return tryNext();
          ctx.drawImage(img, 0, 0);
          resolve(c.toDataURL("image/png"));
        } catch {
          tryNext();
        }
      };
      img.onerror = tryNext;
      img.src = u;
    };
    tryNext();
  });
}
