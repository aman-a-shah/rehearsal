import assert from "node:assert/strict";
import test from "node:test";
import handler from "../api/sandbox-identity.mjs";

test("sandbox identity is available only to the authenticated production API", () => {
  const previous = { ...process.env };
  try {
    Object.assign(process.env, {
      VERCEL_ENV: "production",
      VERCEL_PROJECT_ID: "project",
      VERCEL_TEAM_ID: "team",
      REHEARSAL_SANDBOX_BROKER_SECRET: "a".repeat(64),
    });
    function call({ authorization, method = "POST", identity = "signed-platform-identity" } = {}) {
      const response = { headers: {}, setHeader(k, v) { this.headers[k] = v; }, end(value) { this.body = value; } };
      handler({ method, headers: { authorization, "x-vercel-oidc-token": identity } }, response);
      return response;
    }
    for (const request of [{}, { authorization: "Bearer wrong" }, { authorization: "Bearer " + "a".repeat(64), method: "GET" }, { authorization: "x".repeat(10000) }]) {
      const response = call(request);
      assert.equal(response.statusCode, 404);
      assert(!response.body.includes("signed-platform-identity"));
      assert.match(response.headers["Cache-Control"], /no-store/);
    }
    const authorized = { authorization: "Bearer " + "a".repeat(64) };
    assert.equal(JSON.parse(call(authorized).body).token, "signed-platform-identity");
    process.env.VERCEL_ENV = "preview";
    assert.equal(call(authorized).statusCode, 404);
    process.env.VERCEL_ENV = "production";
    assert.equal(call({ ...authorized, identity: "" }).statusCode, 503);
    process.env.REHEARSAL_SANDBOX_BROKER_SECRET = "";
    assert.equal(call(authorized).statusCode, 404);
  } finally {
    for (const key of Object.keys(process.env)) if (!(key in previous)) delete process.env[key];
    Object.assign(process.env, previous);
  }
});
