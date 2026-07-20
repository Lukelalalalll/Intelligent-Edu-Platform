import { describe, expect, it } from "vitest";

import {
    BIGMODEL_IMAGE_MODEL_OPTIONS,
    BIGMODEL_TEXT_MODEL_OPTIONS,
    CLAUDE_MODEL_OPTIONS,
    MINIMAX_IMAGE_MODEL_OPTIONS,
    MINIMAX_MODEL_CATALOG,
    MINIMAX_MULTIMODAL_MODEL_OPTIONS,
    MINIMAX_TEXT_MODEL_OPTIONS,
    buildBigModelPayload,
} from "./aiConfigHelpers";

describe("aiConfigHelpers BigModel catalog", () => {
  it("does not include pure vision models in text selector", () => {
    expect(BIGMODEL_TEXT_MODEL_OPTIONS.some((item) => item.id === "glm-z1-visual")).toBe(false);
  });

  it("does not include pure text models in image selector", () => {
    expect(BIGMODEL_IMAGE_MODEL_OPTIONS.some((item) => item.id === "glm-4.5-flash")).toBe(false);
  });

  it("includes general-purpose models in both selectors", () => {
    expect(BIGMODEL_TEXT_MODEL_OPTIONS.some((item) => item.id === "glm-5v")).toBe(true);
    expect(BIGMODEL_IMAGE_MODEL_OPTIONS.some((item) => item.id === "glm-5v")).toBe(true);
  });

  it("splits MiniMax models by capability", () => {
    expect(MINIMAX_TEXT_MODEL_OPTIONS).toEqual([
      "MiniMax-M2.7",
      "MiniMax-M2.7-highspeed",
      "MiniMax-M2.5",
      "MiniMax-M2.5-highspeed",
      "MiniMax-M2.1",
      "MiniMax-M2.1-highspeed",
      "MiniMax-M2",
    ]);
    expect(MINIMAX_MULTIMODAL_MODEL_OPTIONS).toEqual(["MiniMax-M3"]);
    expect(MINIMAX_IMAGE_MODEL_OPTIONS).toEqual(["image-01", "image-01-live"]);
    expect(MINIMAX_MODEL_CATALOG.map((item) => [item.id, item.group])).toEqual([
      ["MiniMax-M2.7", "text"],
      ["MiniMax-M2.7-highspeed", "text"],
      ["MiniMax-M2.5", "text"],
      ["MiniMax-M2.5-highspeed", "text"],
      ["MiniMax-M2.1", "text"],
      ["MiniMax-M2.1-highspeed", "text"],
      ["MiniMax-M2", "text"],
      ["MiniMax-M3", "multimodal"],
      ["image-01", "image"],
      ["image-01-live", "image"],
    ]);
  });

  it("builds a trimmed BigModel payload", () => {
    expect(
      buildBigModelPayload({
        base_url: " https://open.bigmodel.cn/api/paas/v4/ ",
        api_key: " test-key ",
        api_key_set: true,
        text_model: " glm-4.5-flash ",
        image_model: " glm-5v-flash ",
        stream: false,
        updated_at: null,
      })
    ).toEqual({
      base_url: "https://open.bigmodel.cn/api/paas/v4/",
      api_key: "test-key",
      clear_api_key: false,
      text_model: "glm-4.5-flash",
      image_model: "glm-5v-flash",
      stream: false,
    });
  });

  it("exposes the supported Claude models", () => {
    expect(CLAUDE_MODEL_OPTIONS).toEqual([
      "claude-sonnet-5",
      "claude-opus-4-8",
      "claude-haiku-4-5",
      "claude-fable-5",
    ]);
  });
});
