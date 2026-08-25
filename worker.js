export default {
  async fetch(request, env) {
    const url = new URL(request.url);

    if (url.pathname.startsWith("/api/")) {
      const apiOrigin = env.RAILWAY_API_ORIGIN || "https://g-clips-production.up.railway.app";
      const upstreamUrl = new URL(url.pathname + url.search, apiOrigin);
      const headers = new Headers(request.headers);

      headers.delete("host");

      return fetch(upstreamUrl, {
        method: request.method,
        headers,
        body: request.body,
        redirect: "manual",
      });
    }

    return env.ASSETS.fetch(request);
  },
};
