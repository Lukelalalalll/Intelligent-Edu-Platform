import { beforeEach, describe, expect, it, vi } from "vitest";

import {
  appendPptGeneratorProviderParam,
  applyPptGeneratorProviderOverride,
  clearStoredPptGeneratorProviderOverride,
  getConfiguredPptGeneratorProviders,
  readStoredPptGeneratorProviderOverride,
  resolvePptGeneratorProviderOverride,
  writeStoredPptGeneratorProviderOverride,
} from "./providerOverride";

describe("providerOverride", () => {
  beforeEach(() => {
    window.sessionStorage.clear();
    window.history.replaceState({}, "", "/slides/ppt_generator");
  });

  it("returns configured providers from AI config", () => {
    expect(
      getConfiguredPptGeneratorProviders({
        openai: { api_key_set: true } as never,
        deepseek: { api_key_set: false } as never,
      })
    ).toEqual(["openai"]);
  });

  it("stores and reads a valid provider override", () => {
    writeStoredPptGeneratorProviderOverride("deepseek");
    expect(readStoredPptGeneratorProviderOverride()).toBe("deepseek");
  });

  it("falls back to the first configured provider when stored override is invalid", () => {
    window.sessionStorage.setItem("ppt_generator_provider_override", "bad");
    const provider = resolvePptGeneratorProviderOverride({
      openai: { api_key_set: true } as never,
      deepseek: { api_key_set: true } as never,
    });
    expect(provider).toBe("openai");
    expect(readStoredPptGeneratorProviderOverride()).toBe("openai");
  });

  it("clears override when no provider is configured", () => {
    writeStoredPptGeneratorProviderOverride("openai");
    const provider = resolvePptGeneratorProviderOverride({
      openai: { api_key_set: false } as never,
      deepseek: { api_key_set: false } as never,
    });
    expect(provider).toBeNull();
    expect(readStoredPptGeneratorProviderOverride()).toBeNull();
  });

  it("applies an override to host config without mutating other fields", () => {
    expect(
      applyPptGeneratorProviderOverride(
        { LLM: "openai", OPENAI_MODEL: "gpt-5.5" },
        "deepseek"
      )
    ).toEqual({
      LLM: "deepseek",
      OPENAI_MODEL: "gpt-5.5",
    });
  });

  it("appends provider query param for SSE URLs", () => {
    writeStoredPptGeneratorProviderOverride("openai");
    expect(
      appendPptGeneratorProviderParam("/api/v1/ppt/outlines/stream/123")
    ).toContain("ppt_generator_provider=openai");
  });

  it("does not append provider query param when no override exists", () => {
    clearStoredPptGeneratorProviderOverride();
    expect(
      appendPptGeneratorProviderParam("/api/v1/ppt/outlines/stream/123")
    ).toBe("/api/v1/ppt/outlines/stream/123");
  });
});

