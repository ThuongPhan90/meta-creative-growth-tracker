import { describe, expect, it } from "vitest";

import nextConfig from "./next.config";

describe("Next.js security headers", () => {
  it("allows the exact Meta OAuth dialog origin without widening form targets", async () => {
    const headerRules = await nextConfig.headers?.();
    const contentSecurityPolicy = headerRules
      ?.flatMap((rule) => rule.headers)
      .find((header) => header.key === "Content-Security-Policy")?.value;

    expect(contentSecurityPolicy).toBeDefined();

    const formAction = contentSecurityPolicy
      ?.split("; ")
      .find((directive) => directive.startsWith("form-action "));

    expect(formAction).toBe(
      "form-action 'self' https://www.facebook.com",
    );
    expect(formAction).not.toContain("*");
  });
});
