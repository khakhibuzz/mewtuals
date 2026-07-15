import { describe, expect, it } from "vitest";

import * as verifyRoute from "../app/auth/verify/route";

type VerificationRoute = {
  GET(request: Request): Promise<Response>;
  POST?: (request: Request) => Promise<Response>;
};

const route = verifyRoute as VerificationRoute;
const validToken = "a".repeat(43);

describe("magic-link verification route", () => {
  it("keeps GET non-mutating by rendering a no-store POST confirmation", async () => {
    const response = await route.GET(
      new Request(
        `http://localhost:4000/auth/verify?token=${encodeURIComponent(validToken)}`,
      ),
    );
    const html = await response.text();

    expect(response.status).toBe(200);
    expect(response.headers.get("cache-control")).toBe("no-store");
    expect(response.headers.get("referrer-policy")).toBe("no-referrer");
    expect(response.headers.get("content-security-policy")).toContain(
      "form-action 'self'",
    );
    expect(html).toContain('method="post"');
    expect(html).toContain('action="/auth/verify"');
    expect(html).toContain('name="token"');
    expect(html).toContain(`value="${validToken}"`);
    expect(html).toContain("Continue to Mewtuals");
    expect(response.headers.get("set-cookie")).toBeNull();
  });

  it("does not reflect malformed token content into the confirmation page", async () => {
    const unsafeToken = '\"><script data-unsafe="true">alert(1)</script>';
    const response = await route.GET(
      new Request(
        `http://localhost:4000/auth/verify?token=${encodeURIComponent(unsafeToken)}`,
      ),
    );
    const html = await response.text();

    expect(response.status).toBe(400);
    expect(html).not.toContain(unsafeToken);
    expect(html).not.toContain("<script");
    expect(html).not.toContain('name="token"');
    expect(html).toContain("Request a fresh sign-in link");
  });

  it("exposes a same-origin POST handler for token consumption", async () => {
    expect(route.POST).toBeTypeOf("function");
    if (!route.POST) return;

    const response = await route.POST(
      new Request("http://localhost:4000/auth/verify", {
        method: "POST",
        headers: {
          "Content-Type": "application/x-www-form-urlencoded",
          Origin: "https://attacker.example",
        },
        body: new URLSearchParams({ token: validToken }),
      }),
    );

    expect(response.status).toBe(403);
  });
});
