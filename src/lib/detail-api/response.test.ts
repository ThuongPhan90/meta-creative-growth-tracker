import { beforeEach, describe, expect, it, vi } from "vitest";
import { NextRequest } from "next/server";

const mocks = vi.hoisted(() => ({
  createTrackerRepository: vi.fn(),
  getApplicationOperationalSnapshot: vi.fn(),
  getApplicationSnapshot: vi.fn(),
  assertOwnerSessionBinding: vi.fn(),
  requireOwnerSession: vi.fn(() => ({ sub: "connection-1" })),
  routeErrorResponse: vi.fn(),
}));

vi.mock("server-only", () => ({}));
vi.mock("@/lib/db", () => ({
  createTrackerRepository: mocks.createTrackerRepository,
}));
vi.mock("@/lib/app-data", () => ({
  getApplicationOperationalSnapshot:
    mocks.getApplicationOperationalSnapshot,
  getApplicationSnapshot: mocks.getApplicationSnapshot,
}));
vi.mock("@/lib/server", () => ({
  assertOwnerSessionBinding: mocks.assertOwnerSessionBinding,
  requireOwnerSession: mocks.requireOwnerSession,
  routeErrorResponse: mocks.routeErrorResponse,
}));

import {
  DetailApiError,
  requireOwnerDetailContext,
  requireOwnerDetailOperationalSnapshot,
  requireOwnerDetailSnapshot,
} from "./response";

const request = new NextRequest(
  "https://tracker.example/api/creative-families/cf_0123456789abcdef01234567",
);

describe("owner detail API context", () => {
  beforeEach(() => {
    vi.clearAllMocks();
  });

  it("requires the owner session to match the stored connection", async () => {
    const repository = {
      getConnection: vi.fn().mockResolvedValue({
        connectionId: "connection-1",
      }),
    };
    mocks.createTrackerRepository.mockResolvedValue(repository);

    const context = await requireOwnerDetailContext(request);

    expect(mocks.requireOwnerSession).toHaveBeenCalledWith(request);
    expect(mocks.assertOwnerSessionBinding).toHaveBeenCalledWith(
      { sub: "connection-1" },
      "connection-1",
    );
    expect(context.repository).toBe(repository);
  });

  it("returns a clear conflict when no owner connection exists", async () => {
    mocks.createTrackerRepository.mockResolvedValue({
      getConnection: vi.fn().mockResolvedValue(null),
    });

    await expect(requireOwnerDetailContext(request)).rejects.toMatchObject({
      name: "DetailApiError",
      status: 409,
      code: "META_NOT_CONNECTED",
    } satisfies Partial<DetailApiError>);
  });

  it("rejects a snapshot that is not bound to the same owner", async () => {
    mocks.createTrackerRepository.mockResolvedValue({
      getConnection: vi.fn().mockResolvedValue({
        connectionId: "connection-1",
      }),
    });
    mocks.getApplicationSnapshot.mockResolvedValue({
      authenticated: false,
      connection: null,
    });

    await expect(
      requireOwnerDetailSnapshot(request),
    ).rejects.toMatchObject({
      code: "OWNER_CONTEXT_UNAVAILABLE",
    });
  });

  it("loads the owner-bound operational projection without the full snapshot", async () => {
    const connection = { connectionId: "connection-1" };
    mocks.createTrackerRepository.mockResolvedValue({
      getConnection: vi.fn().mockResolvedValue(connection),
    });
    const snapshot = {
      authenticated: true,
      connection,
    };
    mocks.getApplicationOperationalSnapshot.mockResolvedValue(snapshot);

    await expect(
      requireOwnerDetailOperationalSnapshot(request),
    ).resolves.toMatchObject({ connection, snapshot });
    expect(mocks.getApplicationOperationalSnapshot).toHaveBeenCalledOnce();
    expect(mocks.getApplicationSnapshot).not.toHaveBeenCalled();
  });
});
