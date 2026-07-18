import { describe, expect, it } from "vitest";

import {
  PPT_GENERATOR_ROUTE_PATHS,
  getPptGeneratorCanonicalBase,
  isPptGeneratorRoutePath,
  mapPptGeneratorHrefToAppRoute,
  normalizePptGeneratorPathname,
  shouldBypassAuthBootstrap,
} from "./routeMeta";

describe("ppt generator route meta", () => {
  it("normalizes legacy route paths to canonical paths", () => {
    expect(normalizePptGeneratorPathname("/dashboard/")).toBe(
      PPT_GENERATOR_ROUTE_PATHS.dashboard,
    );
    expect(normalizePptGeneratorPathname("/slides/ppt_generator/theme")).toBe(
      PPT_GENERATOR_ROUTE_PATHS.theme,
    );
    expect(getPptGeneratorCanonicalBase()).toBe(
      PPT_GENERATOR_ROUTE_PATHS.canonicalBase,
    );
  });

  it("identifies ppt generator routes and auth bypass paths", () => {
    expect(isPptGeneratorRoutePath("/slides/ppt_generator/dashboard")).toBe(
      true,
    );
    expect(isPptGeneratorRoutePath("/dashboard")).toBe(true);
    expect(isPptGeneratorRoutePath("/not-a-ppt-route")).toBe(false);

    expect(shouldBypassAuthBootstrap("/pdf-maker")).toBe(true);
    expect(shouldBypassAuthBootstrap("/slides/ppt_generator/pdf-maker")).toBe(
      true,
    );
    expect(shouldBypassAuthBootstrap("/slides/ppt_generator/presentation")).toBe(
      false,
    );
  });

  it("maps legacy hrefs to canonical app routes", () => {
    expect(mapPptGeneratorHrefToAppRoute("/dashboard?foo=1#panel")).toBe(
      `${PPT_GENERATOR_ROUTE_PATHS.dashboard}?foo=1#panel`,
    );
    expect(mapPptGeneratorHrefToAppRoute("?foo=1")).toBe("?foo=1");
    expect(mapPptGeneratorHrefToAppRoute("https://example.com")).toBe(
      "https://example.com",
    );
  });
});
