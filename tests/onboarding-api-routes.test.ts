import { describe, expect, it } from "vitest";

import * as identityRoute from "../app/api/onboarding/identity/route";
import * as sourceRoute from "../app/api/onboarding/source/route";
import * as profileRoute from "../app/api/onboarding/profile/route";
import * as verificationRoute from "../app/api/verification/submit/route";

const routes = [
  ["identity", identityRoute],
  ["source", sourceRoute],
  ["profile", profileRoute],
  ["verification", verificationRoute],
] as const;

describe("onboarding API routes", () => {
  it.each(routes)("protects the %s mutation with same-origin JSON errors", async (_name, route) => {
    expect(route.POST).toBeTypeOf("function");
    const response = await route.POST(
      new Request("http://localhost:4000/api/onboarding/test", {
        method: "POST",
        headers: {
          Origin: "https://attacker.example",
          "Content-Type": "application/json",
        },
        body: "{}",
      }),
    );
    expect(response.status).toBe(403);
    expect(await response.json()).toEqual({
      ok: false,
      error: "Request origin does not match this site.",
    });
  });
});
