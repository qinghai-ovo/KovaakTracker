export function browserFetch(input: RequestInfo | URL, init?: RequestInit): Promise<Response> {
  const url = typeof input === "string" || input instanceof URL ? String(input) : input.url;
  const proxiedUrl = localDevProxyUrl(url);
  if (!proxiedUrl && needsLocalDevProxy(url)) {
    throw new LocalDevProxyUnavailableError(url);
  }
  return fetch(proxiedUrl || input, init);
}

export function localDevProxyUrl(url: string): string | null {
  if (typeof window === "undefined") return null;
  const { hostname, port } = window.location;
  if (!["localhost", "127.0.0.1"].includes(hostname) || port !== "5173") return null;
  if (url.startsWith("https://evxl.app/")) return `/evxl-proxy/${url.slice("https://evxl.app/".length)}`;
  if (url.startsWith("https://kovaaks.com/")) return `/kovaaks-proxy/${url.slice("https://kovaaks.com/".length)}`;
  return null;
}

export class LocalDevProxyUnavailableError extends Error {
  constructor(url: string) {
    super(`Online benchmark sync requires the Vite dev server proxy for ${url}`);
    this.name = "LocalDevProxyUnavailableError";
  }
}

export function needsLocalDevProxy(url: string): boolean {
  if (typeof window === "undefined") return false;
  const { hostname, port } = window.location;
  const isLocal = ["localhost", "127.0.0.1"].includes(hostname);
  const isExternalBenchmarkUrl = url.startsWith("https://evxl.app/") || url.startsWith("https://kovaaks.com/");
  return isLocal && port !== "5173" && isExternalBenchmarkUrl;
}
