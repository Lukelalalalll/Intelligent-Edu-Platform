import { beforeEach, describe, expect, it, vi } from "vitest";

import {
  appendPresentonProviderParam,
  applyPresentonProviderOverride,
  clearStoredPresentonProviderOverride,
  getConfiguredPresentonProviders,
  readStoredPresentonProviderOverride,
  resolvePresentonProviderOverride,
  writeStoredPresentonProviderOverride,
} from "./providerOverride";

describe("providerOverride", () => {
  beforeEach(() => {
    window.sessionStorage.clear();
    window.history.replaceState({}, "", "/slides/presenton");
  });

  it("returns configured providers from AI config", () => {
    expect(
      getConfiguredPresentonProviders({
        openai: { api_key_set: true } as never,
        deepseek: { api_key_set: false } as never,
      })
    ).toEqual(["openai"]);
  });

  it("stores and reads a valid provider override", () => {
    writeStoredPresentonProviderOverride("deepseek");
    expect(readStoredPresentonProviderOverride()).toBe("deepseek");
  });

  it("falls back to the first configured provider when stored override is invalid", () => {
    window.sessionStorage.setItem("presenton_provider_override", "bad");
    const provider = resolvePresentonProviderOverride({
      openai: { api_key_set: true } as never,
      deepseek: { api_key_set: true } as never,
    });
    expect(provider).toBe("openai");
    expect(readStoredPresentonProviderOverride()).toBe("openai");
  });

  it("clears override when no provider is configured", () => {
    writeStoredPresentonProviderOverride("openai");
    const provider = resolvePresentonProviderOverride({
      openai: { api_key_set: false } as never,
      deepseek: { api_key_set: false } as never,
    });
    expect(provider).toBeNull();
    expect(readStoredPresentonProviderOverride()).toBeNull();
  });

  it("applies an override to host config without mutating other fields", () => {
    expect(
      applyPresentonProviderOverride(
        { LLM: "openai", OPENAI_MODEL: "gpt-5.5" },
        "deepseek"
      )
    ).toEqual({
      LLM: "deepseek",
      OPENAI_MODEL: "gpt-5.5",
    });
  });

  it("appends provider query param for SSE URLs", () => {
    writeStoredPresentonProviderOverride("openai");
    expect(
      appendPresentonProviderParam("/api/v1/ppt/outlines/stream/123")
    ).toContain("presenton_provider=openai");
  });

  it("does not append provider query param when no override exists", () => {
    clearStoredPresentonProviderOverride();
    expect(
      appendPresentonProviderParam("/api/v1/ppt/outlines/stream/123")
    ).toBe("/api/v1/ppt/outlines/stream/123");
  });
});
