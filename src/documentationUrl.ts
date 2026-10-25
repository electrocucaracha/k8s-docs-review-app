export function documentationUrl(value: string): URL {
  if (value.length > 2048) throw new Error("Reference URL is too long.");
  const url = new URL(value);
  if (
    url.protocol !== "https:" ||
    url.hostname !== "kubernetes.io" ||
    url.port ||
    url.username ||
    url.password ||
    !/^\/(?:[a-z]{2}(?:-[a-z]+)?\/)?docs(?:\/|$)/.test(url.pathname)
  )
    throw new Error("Only HTTPS Kubernetes documentation URLs can be checked.");
  url.search = "";
  url.hash = "";
  return url;
}
