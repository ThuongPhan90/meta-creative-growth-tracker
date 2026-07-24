import { describe, expect, it } from "vitest";

import {
  isOperationalAdAccount,
  metaAdAccountStatusLabel,
} from "./ad-account-status";

describe("Meta ad account status", () => {
  it("requires both current discovery access and Meta ACTIVE status", () => {
    expect(
      isOperationalAdAccount({ isActive: true, accountStatus: 1 }),
    ).toBe(true);
    expect(
      isOperationalAdAccount({ isActive: false, accountStatus: 1 }),
    ).toBe(false);
    expect(
      isOperationalAdAccount({ isActive: true, accountStatus: 101 }),
    ).toBe(false);
  });

  it("labels known closed states without hiding unknown Meta values", () => {
    expect(metaAdAccountStatusLabel(1)).toBe("ACTIVE");
    expect(metaAdAccountStatusLabel(101)).toBe("CLOSED");
    expect(metaAdAccountStatusLabel(999)).toBe("STATUS 999");
    expect(metaAdAccountStatusLabel(null)).toBe("UNKNOWN");
  });
});
