import { describe, expect, it } from "vitest";

import {
  allLayouts,
  generalTemplates,
  getLayoutByLayoutId,
  getSettingsByTemplateId,
  getTemplatesByTemplateName,
  templates,
} from "./catalog";

describe("presentation template catalog", () => {
  it("exposes grouped families with settings", () => {
    expect(templates.length).toBeGreaterThan(0);
    expect(allLayouts.length).toBeGreaterThan(0);
    expect(generalTemplates.length).toBeGreaterThan(0);

    const generalSettings = getSettingsByTemplateId("general");
    expect(generalSettings).toMatchObject({
      description: expect.any(String),
      ordered: expect.any(Boolean),
      default: expect.any(Boolean),
    });
  });

  it("resolves layouts by id and family fallback", () => {
    const layouts = getTemplatesByTemplateName("general");
    expect(layouts.length).toBeGreaterThan(0);

    const [layout] = layouts;
    const shortLayoutId = layout.layoutId.split(":").pop() ?? layout.layoutId;

    expect(getLayoutByLayoutId(layout.layoutId)).toBe(layout);
    expect(getLayoutByLayoutId(shortLayoutId)).toBe(layout);
    expect(getLayoutByLayoutId(shortLayoutId, "general")).toBe(layout);
    expect(getLayoutByLayoutId("missing-layout")).toBeUndefined();
  });
});
