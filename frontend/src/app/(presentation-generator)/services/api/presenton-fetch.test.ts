import { beforeEach, describe, expect, it, vi } from "vitest";

import { presentonFetch } from "./presenton-fetch";

vi.mock("@/shared/store/useAuthStore", () => ({
  useAuthStore: {
    getState: () => ({
      logout: vi.fn(),
      login: vi.fn(),
    }),
  },
}));

describe("presentonFetch", () => {
  beforeEach(() => {
    window.sessionStorage.clear();
    window.history.replaceState({}, "", "/slides/presenton");
    document.cookie = "csrf_token=test-token";
    vi.restoreAllMocks();
  });

  it("adds presenton provider override header when available", async () => {
    window.sessionStorage.setItem("presenton_provider_override", "deepseek");
    const fetchSpy = vi
      .spyOn(globalThis, "fetch")
      .mockResolvedValue(new Response(null, { status: 200 }));

    await presentonFetch("/api/example", { method: "POST" });

    const [, options] = fetchSpy.mock.calls[0];
    const headers = new Headers(options?.headers);
    expect(headers.get("X-Presenton-LLM-Provider")).toBe("deepseek");
    expect(headers.get("X-CSRF-Token")).toBe("test-token");
  });

  it("does not add provider override header when none is stored", async () => {
    const fetchSpy = vi
      .spyOn(globalThis, "fetch")
      .mockResolvedValue(new Response(null, { status: 200 }));

    await presentonFetch("/api/example", { method: "GET" });

    const [, options] = fetchSpy.mock.calls[0];
    const headers = new Headers(options?.headers);
    expect(headers.get("X-Presenton-LLM-Provider")).toBeNull();
  });
});
