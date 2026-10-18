// Server-to-server credential exchange. This function never accepts source code.
import { createHash, timingSafeEqual } from "node:crypto";

const hash = (value) => createHash("sha256").update(value).digest();

export default function handler(request, response) {
  response.setHeader("Cache-Control", "no-store, max-age=0");
  response.setHeader("Content-Type", "application/json");
  const secret = process.env.REHEARSAL_SANDBOX_BROKER_SECRET || "";
  const supplied = request.headers.authorization || "";
  if (
    request.method !== "POST" ||
    process.env.VERCEL_ENV !== "production" ||
    secret.length < 40 ||
    typeof supplied !== "string" ||
    supplied.length > 512 ||
    !timingSafeEqual(hash(supplied), hash("Bearer " + secret))
  ) {
    response.statusCode = 404;
    response.end('{"error":"not_found"}');
    return;
  }
  // Vercel injects this header at invocation and rotates the signed identity.
  const token = request.headers["x-vercel-oidc-token"];
  const project = process.env.VERCEL_PROJECT_ID;
  const team = process.env.VERCEL_TEAM_ID || process.env.VERCEL_ORG_ID;
  if (typeof token !== "string" || !token || !project || !team) {
    response.statusCode = 503;
    response.end('{"error":"identity_unavailable"}');
    return;
  }
  response.statusCode = 200;
  response.end(JSON.stringify({ token, project_id: project, team_id: team }));
}
