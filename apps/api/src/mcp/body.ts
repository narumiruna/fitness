export class McpBodyError extends Error {
  constructor(public readonly status: 400 | 413 | 408) {
    super("MCP_BODY_REJECTED");
  }
}

/** Bound both byte count and read time, including chunked or stalled bodies. */
export async function readMcpBody(
  request: Request,
  maxBytes: number,
  deadlineAt = Date.now() + 15_000,
) {
  const declared = request.headers.get("content-length");
  if (declared && Number(declared) > maxBytes) throw new McpBodyError(413);
  const reader = request.body?.getReader();
  if (!reader) return "";
  const chunks: Uint8Array[] = [];
  let size = 0;
  let timedOut = false;
  const timer = setTimeout(
    () => {
      timedOut = true;
      void reader.cancel().catch(() => {});
    },
    Math.max(1, deadlineAt - Date.now()),
  );
  timer.unref();
  try {
    for (;;) {
      const { done, value } = await reader.read();
      if (timedOut) throw new McpBodyError(408);
      if (done) break;
      size += value.byteLength;
      if (size > maxBytes) {
        await reader.cancel();
        throw new McpBodyError(413);
      }
      chunks.push(value);
    }
    const bytes = new Uint8Array(size);
    let offset = 0;
    for (const chunk of chunks) {
      bytes.set(chunk, offset);
      offset += chunk.byteLength;
    }
    return new TextDecoder("utf-8", { fatal: true }).decode(bytes);
  } catch (error) {
    if (error instanceof McpBodyError) throw error;
    throw new McpBodyError(400);
  } finally {
    clearTimeout(timer);
    reader.releaseLock();
  }
}
