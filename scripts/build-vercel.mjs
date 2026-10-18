import { spawnSync } from "node:child_process";
import { cp, mkdir, rm, writeFile } from "node:fs/promises";
const value = process.env.REHEARSAL_API_ORIGIN;
if (!value)
  throw new Error(
    "Set REHEARSAL_API_ORIGIN to the persistent API's HTTPS origin before building the Vercel site.",
  );
const origin = new URL(value);
if (
  origin.protocol !== "https:" ||
  origin.pathname !== "/" ||
  origin.search ||
  origin.hash ||
  origin.username ||
  origin.password ||
  origin.port
)
  throw new Error(
    "REHEARSAL_API_ORIGIN must be an HTTPS origin without credentials, a path, or a nonstandard port.",
  );
const built = spawnSync("npm", ["--prefix", "web", "run", "build"], {
  stdio: "inherit",
});
if (built.status !== 0) process.exit(built.status || 1);
await rm(".vercel/output", { recursive: true, force: true });
await mkdir(".vercel/output/static", { recursive: true });
await cp("web/dist", ".vercel/output/static", { recursive: true });
const identity = ".vercel/output/functions/internal/sandbox-identity.func";
await mkdir(identity, { recursive: true });
await cp("api/sandbox-identity.mjs", identity + "/index.mjs");
await writeFile(identity + "/.vc-config.json", JSON.stringify({ runtime: "nodejs22.x", handler: "index.mjs", launcherType: "Nodejs" }));
await writeFile(
  ".vercel/output/config.json",
  JSON.stringify(
    {
      version: 3,
      routes: [
        {
          src: "/(.*)",
          headers: {
            "X-Content-Type-Options": "nosniff",
            "Referrer-Policy": "no-referrer",
            "X-Frame-Options": "DENY",
            "Content-Security-Policy":
              "default-src 'self'; script-src 'self'; style-src 'self' 'unsafe-inline'; img-src 'self' data: blob:; connect-src 'self'; font-src 'self'; object-src 'none'; base-uri 'self'; frame-ancestors 'none'; form-action 'self'",
          },
          continue: true,
        },
        { src: "/internal/sandbox-identity", dest: "/internal/sandbox-identity" },
        {
          src: "/api/(.*)",
          dest: origin.origin + "/api/$1",
          headers: { "Cache-Control": "no-store" },
        },
        {
          src: "/exports-service/(.*)",
          dest: origin.origin + "/exports-service/$1",
          headers: { "Cache-Control": "no-store" },
        },
        { handle: "filesystem" },
        { src: "/(.*)", dest: "/index.html" },
      ],
    },
    null,
    2,
  ),
);
console.log("Prepared Vercel static output and same-origin API routing.");
