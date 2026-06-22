import { render, screen } from "@testing-library/react";
import { describe, expect, it, vi } from "vitest";
import { OutlineItem } from "./OutlineItem";

describe("OutlineItem", () => {
  it("keeps the active streaming slide in a plain text shell until the slide settles", () => {
    const { rerender } = render(
      <OutlineItem
        sortableId="slide-0"
        index={1}
        slideOutline={{ content: "# Slide 1\n\n- Detail" }}
        isStreaming={true}
        isActiveStreaming={true}
        isStableStreaming={false}
        enableSorting={false}
        onChange={vi.fn()}
        onDelete={vi.fn()}
      />
    );

    expect(screen.getByText("Generating this slide")).toBeInTheDocument();
    expect(screen.queryByRole("heading")).toBeNull();
    expect(screen.getByText("# Slide 1", { exact: false })).toBeInTheDocument();

    rerender(
      <OutlineItem
        sortableId="slide-0"
        index={1}
        slideOutline={{ content: "# Slide 1\n\n- Detail" }}
        isStreaming={true}
        isActiveStreaming={false}
        isStableStreaming={true}
        enableSorting={false}
        onChange={vi.fn()}
        onDelete={vi.fn()}
      />
    );

    expect(screen.getByRole("heading", { name: "Slide 1" })).toBeInTheDocument();
    expect(screen.queryByText("Generating this slide")).toBeNull();
  });
});
