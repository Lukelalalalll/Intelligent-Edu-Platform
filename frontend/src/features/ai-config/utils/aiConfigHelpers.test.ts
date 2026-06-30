import { describe, expect, it } from "vitest";

import {
  BIGMODEL_IMAGE_MODEL_OPTIONS,
  BIGMODEL_TEXT_MODEL_OPTIONS,
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
});
