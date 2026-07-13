import type { ChatStreamTrace } from "../../../services/api/chat";
import {
  MUTATING_TOOLS,
  TOOL_LABELS,
} from "./Chat.constants";
import type { AssistantActivity } from "./Chat.types";

export const createMessageId = () => {
  if (typeof crypto !== "undefined" && "randomUUID" in crypto) {
    return crypto.randomUUID();
  }

  return `${Date.now()}-${Math.random().toString(16).slice(2)}`;
};

export const conversationStorageKey = (presentationId: string) =>
  `ppt_generator:chat:conversationId:${presentationId}`;

export const getToolLabel = (tool?: string) => {
  if (!tool) {
    return "";
  }

  return TOOL_LABELS[tool] ?? tool;
};

export const humanizeTraceMessage = (message: string, tool?: string) => {
  const trimmed = message.trim();
  if (!trimmed) {
    return "";
  }

  const lower = trimmed.toLowerCase();
  if (lower === "reading deck context") {
    return "Reviewing your presentation context.";
  }
  if (lower === "reading the presentation outline") {
    return "Reading the presentation outline.";
  }
  if (lower === "searching relevant slides") {
    return "Searching slides for relevant content.";
  }
  if (lower === "opening the requested slide") {
    return "Opening the selected slide.";
  }
  if (lower === "checking available themes") {
    return "Checking available color themes.";
  }
  if (lower === "checking available layouts") {
    return "Checking available layouts.";
  }
  if (lower === "checking the layout schema") {
    return "Validating the slide schema.";
  }
  if (lower === "generating slide assets") {
    return "Generating images and icons.";
  }
  if (lower === "saving the slide") {
    return "Saving slide updates.";
  }
  if (lower === "deleting the slide") {
    return "Deleting the slide.";
  }
  if (lower === "applying presentation theme") {
    return "Applying the selected theme.";
  }
  if (lower.startsWith("using tools:")) {
    const toolNames = trimmed
      .slice("using tools:".length)
      .split(",")
      .map((entry) => entry.trim())
      .filter(Boolean)
      .map((entry) => getToolLabel(entry));
    if (toolNames.length === 0) {
      return "Planning tool steps.";
    }
    return `Planning tools: ${toolNames.join(", ")}.`;
  }
  if (lower.includes("found requested data")) {
    if (tool === "getSlideAtIndex") {
      return "Found the requested slide details.";
    }
    if (tool === "getPresentationOutline") {
      return "Found the requested outline details.";
    }
    return "Found the requested information.";
  }
  if (lower.endsWith("completed.") || lower.includes("failed")) {
    return trimmed;
  }

  return trimmed;
};

export const inferStatusState = (
  status: string
): AssistantActivity["state"] => {
  const normalized = status.trim().toLowerCase();
  if (
    normalized.includes("preparing") ||
    normalized.includes("thinking") ||
    normalized.includes("reading") ||
    normalized.includes("searching") ||
    normalized.includes("opening") ||
    normalized.includes("generating") ||
    normalized.includes("processing") ||
    normalized.includes("finalizing") ||
    normalized.includes("saving")
  ) {
    return "running";
  }

  return "info";
};

export const isAbortError = (error: unknown) =>
  (error instanceof DOMException && error.name === "AbortError") ||
  (error instanceof Error &&
    error.message.toLowerCase().includes("aborted") &&
    error.message.toLowerCase().includes("request"));

export const stripBackendContextFromUserMessage = (rawMessage: string) => {
  const message = rawMessage ?? "";
  if (!message.startsWith("UI context:")) {
    return message;
  }

  const marker = "\nUser message:";
  const markerIndex = message.indexOf(marker);
  if (markerIndex === -1) {
    return message;
  }

  return message.slice(markerIndex + marker.length).trimStart();
};

export const formatTraceActivity = (
  trace: ChatStreamTrace
): Omit<AssistantActivity, "id"> | null => {
  if (typeof trace.message === "string" && trace.message.trim().length > 0) {
    return {
      label: humanizeTraceMessage(trace.message, trace.tool),
      kind: trace.kind,
      round: trace.round,
      tool: trace.tool,
      state:
        trace.status === "error"
          ? "error"
          : trace.status === "success"
          ? "success"
          : trace.status === "ready" || trace.status === "info"
          ? "info"
          : "running",
    };
  }

  if (trace.tool && trace.status === "start") {
    return {
      label: `Running ${getToolLabel(trace.tool)}...`,
      kind: trace.kind,
      round: trace.round,
      tool: trace.tool,
      state: "running",
    };
  }

  if (trace.tool && trace.status === "success") {
    return {
      label: `${getToolLabel(trace.tool)} completed.`,
      kind: trace.kind,
      round: trace.round,
      tool: trace.tool,
      state: "success",
    };
  }

  if (trace.tool && trace.status === "error") {
    return {
      label: `${getToolLabel(trace.tool)} failed.`,
      kind: trace.kind,
      round: trace.round,
      tool: trace.tool,
      state: "error",
    };
  }

  if (
    trace.kind === "tool_plan" &&
    Array.isArray(trace.tools) &&
    trace.tools.length
  ) {
    return {
      label: `Planning tools: ${trace.tools
        .map((tool) => getToolLabel(tool))
        .join(", ")}.`,
      kind: trace.kind,
      round: trace.round,
      state: "info",
    };
  }

  return null;
};

export const readTraceSlideIndex = (trace: ChatStreamTrace) => {
  if (typeof trace.slideIndex === "number" && trace.slideIndex >= 0) {
    return trace.slideIndex;
  }
  if (typeof trace.slideNumber === "number" && trace.slideNumber > 0) {
    return trace.slideNumber - 1;
  }

  return null;
};

export const buildBackendMessage = (
  message: string,
  currentSlide?: number
) => {
  if (typeof currentSlide !== "number") {
    return message;
  }

  return [
    `UI context: the currently selected slide is slide ${
      currentSlide + 1
    } (zero-based index ${currentSlide}).`,
    `User message: ${message}`,
  ].join("\n");
};

export const hasPresentationMutationToolCall = (toolCalls: string[]) =>
  toolCalls.some((tool) => MUTATING_TOOLS.has(tool));


