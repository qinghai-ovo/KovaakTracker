export async function exportElementAsPng(element: HTMLElement, fileName: string): Promise<void> {
  const rect = element.getBoundingClientRect();
  const width = Math.ceil(rect.width);
  const height = Math.ceil(Math.max(rect.height, element.scrollHeight));
  if (!width || !height) throw new Error("Cannot export an empty element.");

  const clone = element.cloneNode(true) as HTMLElement;
  clone.querySelectorAll("[data-export-ignore='true']").forEach((node) => node.remove());
  clone.style.width = `${width}px`;
  clone.style.height = `${height}px`;
  clone.style.margin = "0";
  clone.style.transform = "none";

  const css = collectDocumentStyles();
  const background = getComputedStyle(element).backgroundColor || "#0f1115";
  const html = `<!doctype html><html xmlns="http://www.w3.org/1999/xhtml"><head><style>${css}
html,body{margin:0;width:${width}px;min-height:${height}px;background:${background};}
*{box-sizing:border-box;}
</style></head><body>${clone.outerHTML}</body></html>`;
  const svg = `<svg xmlns="http://www.w3.org/2000/svg" width="${width}" height="${height}" viewBox="0 0 ${width} ${height}"><foreignObject width="100%" height="100%">${html}</foreignObject></svg>`;
  const url = URL.createObjectURL(new Blob([svg], { type: "image/svg+xml;charset=utf-8" }));

  try {
    const image = await loadImage(url);
    const scale = Math.min(2, window.devicePixelRatio || 1);
    const canvas = document.createElement("canvas");
    canvas.width = Math.ceil(width * scale);
    canvas.height = Math.ceil(height * scale);
    const context = canvas.getContext("2d");
    if (!context) throw new Error("Canvas export is not available.");
    context.scale(scale, scale);
    context.drawImage(image, 0, 0, width, height);
    const pngUrl = canvas.toDataURL("image/png");
    const link = document.createElement("a");
    link.href = pngUrl;
    link.download = sanitizeFileName(fileName);
    document.body.appendChild(link);
    link.click();
    link.remove();
  } finally {
    URL.revokeObjectURL(url);
  }
}

function collectDocumentStyles(): string {
  return Array.from(document.styleSheets)
    .map((sheet) => {
      try {
        return Array.from(sheet.cssRules).map((rule) => rule.cssText).join("\n");
      } catch {
        return "";
      }
    })
    .filter(Boolean)
    .join("\n");
}

function loadImage(url: string): Promise<HTMLImageElement> {
  return new Promise((resolve, reject) => {
    const image = new Image();
    image.onload = () => resolve(image);
    image.onerror = () => reject(new Error("Could not render export image."));
    image.src = url;
  });
}

function sanitizeFileName(fileName: string): string {
  const safe = fileName.replace(/[\\/:*?"<>|]+/g, "-").trim();
  return safe.toLowerCase().endsWith(".png") ? safe : `${safe}.png`;
}
