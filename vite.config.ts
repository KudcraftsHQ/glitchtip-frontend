import { defineConfig, type ProxyOptions } from "vite";
import react from "@vitejs/plugin-react";
import tailwindcss from "@tailwindcss/vite";

// The dev server talks to a real GlitchTip backend (production by default) through
// a proxy, so the browser only ever sees one origin and allauth's session cookie works.
const target = process.env.GLITCHTIP_API ?? "https://glitchtip.kudcrafts.com";

const proxy: ProxyOptions = {
  target,
  changeOrigin: true,
  secure: true,
  configure(server) {
    // Django's CSRF check compares Origin/Referer against its own host.
    server.on("proxyReq", (req) => {
      // Screenshot runs only: borrow a session opened elsewhere when the browser has none.
      const borrowed = process.env.GLITCHTIP_DEV_SESSIONID;
      const cookie = String(req.getHeader("cookie") ?? "");
      if (borrowed && !cookie.includes("sessionid=")) req.setHeader("cookie", `${cookie}; sessionid=${borrowed}`);
      if (req.getHeader("origin")) req.setHeader("origin", target);
      req.setHeader("referer", target + "/");
    });
    // Cookies come back `Secure`; the dev server is plain http, so drop the flag.
    server.on("proxyRes", (res) => {
      const cookies = res.headers["set-cookie"];
      if (cookies) {
        res.headers["set-cookie"] = cookies.map((c) =>
          c.replace(/;\s*Secure/gi, "").replace(/;\s*Domain=[^;]+/gi, ""),
        );
      }
    });
  },
};

export default defineConfig({
  plugins: [react(), tailwindcss()],
  server: {
    host: "0.0.0.0",
    port: 5180,
    allowedHosts: [".ts.net", "localhost"],
    proxy: { "/api": proxy, "/_allauth": proxy },
  },
});
