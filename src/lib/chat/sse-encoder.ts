// SSE (Server-Sent Events) encoder utility

export class SSEEncoder {
  private encoder = new TextEncoder();

  /**
   * Encode a message for SSE streaming
   */
  encodeMessage(data: string): Uint8Array {
    return this.encoder.encode(`data: ${data}\n\n`);
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
    return this.encoder.encode(`event: error\ndata: ${JSON.stringify({ error })}\n\n`);
  }

  /**
   * Create a ReadableStream for SSE
   */
  createStream(generator: AsyncGenerator<string>): ReadableStream<Uint8Array> {
    const encoder = this;

    return new ReadableStream({
      async start(controller) {
        try {
          for await (const chunk of generator) {
            controller.enqueue(encoder.encodeMessage(chunk));
          }
          controller.enqueue(encoder.encodeComplete());
          controller.close();
        } catch (error) {
          const errorMessage = error instanceof Error ? error.message : 'Unknown error';
          controller.enqueue(encoder.encodeError(errorMessage));
          controller.close();
        }
      }
    });
  }
}
