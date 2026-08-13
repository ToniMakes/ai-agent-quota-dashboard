import assert from "node:assert/strict";
import { describe, it } from "node:test";
import { isAllowedOrigin } from "./http-server.js";

describe("isAllowedOrigin", () => {
  it("allows requests with no Origin header", () => {
    assert.equal(isAllowedOrigin(undefined, 4317), true);
  });

  it("allows same-port loopback origins", () => {
    assert.equal(isAllowedOrigin("http://127.0.0.1:4317", 4317), true);
    assert.equal(isAllowedOrigin("http://localhost:4317", 4317), true);
  });

  it("rejects a mismatched port", () => {
    assert.equal(isAllowedOrigin("http://127.0.0.1:9999", 4317), false);
  });

  it("rejects a non-loopback origin, even if the port matches", () => {
    assert.equal(isAllowedOrigin("http://evil.example:4317", 4317), false);
  });

  it("rejects a malformed origin", () => {
    assert.equal(isAllowedOrigin("not-a-url", 4317), false);
  });
});
