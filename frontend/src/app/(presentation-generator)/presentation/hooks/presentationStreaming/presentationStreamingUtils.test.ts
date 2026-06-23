import { describe, expect, it } from "vitest";
import { mergeStreamedPresentationData } from "./mergePresentationData";
import { drainSseEventBlocks, parseSseEventBlock } from "./sse";
import { formatStreamStatus } from "./shared";

describe("presentation streaming helpers", () => {
  it("parses SSE event blocks and preserves incomplete trailing data", () => {
    const drained = drainSseEventBlocks(
      [
        "event: response",
        "data: {\"type\":\"status\"}",
        "",
        ": keepalive",
        "data: {\"type\":\"chunk\"}",
      ].join("\n")
    );

    expect(drained.events).toEqual([
      {
        event: "response",
        data: "{\"type\":\"status\"}",
      },
    ]);
    expect(drained.remainingBuffer).toBe(": keepalive\ndata: {\"type\":\"chunk\"}");
  });

  it("joins multiline SSE data fields", () => {
    expect(
      parseSseEventBlock(
        ["event: response", "data: first", "data: second", ""].join("\n")
      )
    ).toEqual({
      event: "response",
      data: "first\nsecond",
    });
  });

  it("keeps resolved asset urls when later chunk payloads replay placeholders", () => {
    const merged = mergeStreamedPresentationData(
      {
        id: "presentation-1",
        language: "en",
        layout: { name: "default", ordered: true, slides: [] },
        n_slides: 1,
        title: "Deck",
        theme: null,
        slides: [
          {
            id: "slide-1",
            index: 0,
            layout: "cover",
            layout_group: "intro",
            speaker_note: "",
            title: "Intro",
            type: "cover",
            content: {
              hero: {
                __image_url__: "https://cdn.example.com/resolved.png",
              },
            },
          },
        ],
      },
      {
        slides: [
          {
            id: "slide-1",
            index: 0,
            layout: "cover",
            layout_group: "intro",
            speaker_note: "",
            title: "Intro",
            type: "cover",
            content: {
              hero: {
                __image_url__: "/static/images/placeholder-1.png",
              },
            },
          },
        ],
      }
    );

    expect(merged?.slides[0].content.hero.__image_url__).toBe(
      "https://cdn.example.com/resolved.png"
    );
  });

  it("formats heartbeat after first chunk as an active streaming state", () => {
    expect(formatStreamStatus("heartbeat", true)).toEqual({
      statusText: "Still generating",
      detailText: "More slide updates are still arriving in the background.",
      waitingForFirstContent: false,
    });
  });
});
