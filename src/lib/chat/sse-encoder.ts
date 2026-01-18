// SSE (Server-Sent Events) encoder utility

export type SSEChunk =
  | string
  | { type: 'message'; data: string }
  | { type: 'event'; event: string; data: string };

export class SSEEncoder {
  private encoder = new TextEncoder();

  /**
   * Encode a message for SSE streaming
   */
  encodeMessage(data: string): Uint8Array {
    const lines = data.split(/\r?\n/);
    const payload = lines.map(line => `data: ${line}`).join('\n');
    return this.encoder.encode(`${payload}\n\n`);
  }

  /**
   * Encode a named event for SSE streaming
   */
  encodeEvent(event: string, data: string): Uint8Array {
    return this.encoder.encode(`event: ${event}\ndata: ${data}\n\n`);
  }

  /**
   * Encode completion signal
   */
  encodeComplete(): Uint8Array {
    return this.encoder.encode('data: [DONE]\n\n');
  }

  /**
   * Encode error message
   */
  encodeError(error: string): Uint8Array {
    return this.encoder.encode(`event: server-error\ndata: ${JSON.stringify({ error })}\n\n`);
  }

  /**
   * Create a ReadableStream for SSE
   */
  createStream(generator: AsyncGenerator<SSEChunk>): ReadableStream<Uint8Array> {
    return new ReadableStream({
      start: async (controller) => {
        try {
          for await (const chunk of generator) {
            controller.enqueue(this.encodeChunk(chunk));
          }
          controller.enqueue(this.encodeComplete());
          controller.close();
        } catch (error) {
          const errorMessage = error instanceof Error ? error.message : 'Unknown error';
          controller.enqueue(this.encodeError(errorMessage));
          controller.close();
        }
      },
    });
  }

  private encodeChunk(chunk: SSEChunk): Uint8Array {
    if (typeof chunk === 'string') {
      return this.encodeMessage(chunk);
    }
    if (chunk.type === 'message') {
      return this.encodeMessage(chunk.data);
    }
    return this.encodeEvent(chunk.event, chunk.data);
  }
}
