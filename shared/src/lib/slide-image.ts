const imageCache = new Map<string, HTMLImageElement>();
const MAX_IMAGES = 120;

export function loadSlideImage(url: string): Promise<HTMLImageElement> {
  const live = url.includes("live=1");
  if (!live) {
    const hit = imageCache.get(url);
    if (hit?.complete && hit.naturalWidth) return Promise.resolve(hit);
  }
  return new Promise((resolve, reject) => {
    const img = new Image();
    const sameOrigin = url.startsWith("/") || url.startsWith(window.location.origin);
    if (!sameOrigin) img.crossOrigin = "anonymous";
    img.onload = () => {
      if (!live) {
        imageCache.set(url, img);
        while (imageCache.size > MAX_IMAGES) {
          const first = imageCache.keys().next().value;
          if (first == null) break;
          imageCache.delete(first);
        }
      }
      resolve(img);
    };
    img.onerror = () => reject(new Error("slide"));
    img.src = url;
  });
}
