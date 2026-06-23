export type ParsedSseEventBlock = {
  event: string;
  data: string;
};

export function parseSseEventBlock(block: string): ParsedSseEventBlock | null {
  const lines = block.split("\n");
  let event = "message";
  const data: string[] = [];

  for (const rawLine of lines) {
    const line = rawLine.trimEnd();
    if (!line || line.startsWith(":")) {
      continue;
    }
    if (line.startsWith("event:")) {
      event = line.slice(6).trim();
      continue;
    }
    if (line.startsWith("data:")) {
      data.push(line.slice(5).replace(/^ /, ""));
    }
  }

  if (!data.length) {
    return null;
  }

  return { event, data: data.join("\n") };
}

export function drainSseEventBlocks(buffer: string): {
  events: ParsedSseEventBlock[];
  remainingBuffer: string;
} {
  let workingBuffer = buffer.replace(/\r\n/g, "\n");
  const events: ParsedSseEventBlock[] = [];

  let separatorIndex = workingBuffer.indexOf("\n\n");
  while (separatorIndex !== -1) {
    const rawBlock = workingBuffer.slice(0, separatorIndex);
    workingBuffer = workingBuffer.slice(separatorIndex + 2);

    const parsedEvent = parseSseEventBlock(rawBlock);
    if (parsedEvent) {
      events.push(parsedEvent);
    }

    separatorIndex = workingBuffer.indexOf("\n\n");
  }

  return {
    events,
    remainingBuffer: workingBuffer,
  };
}
