/**
 * The debugger protocol's framing: each message is its length as 8 hexadecimal digits and a
 * newline, then that many bytes of JSON that end in a newline. The extension writes it in
 * `Session.sendDebuggeeMessage` and reads it in `src/message-stream-parser.ts`; koush's
 * `quickjs-debugger.c` writes the same bytes ("length prefix is 8 hex followed by newline").
 */

/** The bytes of a frame's length header: 8 hexadecimal digits and a newline. */
export const FRAME_HEADER_BYTES = 9;

/** The largest length a header can state, its body's JSON and newline together. */
export const MAX_FRAME_LENGTH = 0xffffffff;

/** Why bytes from a debugger connection are not a frame. */
export class DebuggerFramingError extends Error {
    public override readonly name = 'DebuggerFramingError';
}

/**
 * Frames one message.
 * @param message - The message, which JSON can encode.
 * @returns The header, the JSON and its trailing newline.
 */
export const encodeFrame = (message: unknown): Buffer => {
    const json = Buffer.from(JSON.stringify(message), 'utf8');
    const length = json.byteLength + 1;
    if (length > MAX_FRAME_LENGTH) throw new DebuggerFramingError(`A ${length}-byte message does not fit a frame`);
    return Buffer.concat([Buffer.from(`${length.toString(16).padStart(8, '0')}\n`, 'ascii'), json, Buffer.from('\n')]);
};

/**
 * Splits the bytes of a connection into messages, whatever sizes the chunks arrive in. The
 * extension reads each body as JSON whole, so a body's trailing newline is part of the JSON's
 * whitespace and the decoder does not require it.
 */
export class FrameDecoder {
    private pending: Buffer = Buffer.alloc(0);
    private bodyLength: number | undefined;

    /**
     * Takes the next chunk of bytes.
     * @returns The messages the bytes so far complete, in order.
     * @throws {DebuggerFramingError} When a header is not 8 hexadecimal digits and a newline, or a body is not JSON.
     */
    public push(chunk: Uint8Array): unknown[] {
        this.pending = this.pending.byteLength === 0 ? Buffer.from(chunk) : Buffer.concat([this.pending, chunk]);
        const messages: unknown[] = [];
        for (;;) {
            if (this.bodyLength === undefined) {
                if (this.pending.byteLength < FRAME_HEADER_BYTES) break;
                const header = this.pending.toString('ascii', 0, FRAME_HEADER_BYTES);
                if (!/^[0-9a-fA-F]{8}\n$/.test(header)) {
                    throw new DebuggerFramingError(
                        `A frame header is 8 hexadecimal digits and a newline, not ${JSON.stringify(header)}`
                    );
                }
                this.bodyLength = Number.parseInt(header.slice(0, 8), 16);
                this.pending = this.pending.subarray(FRAME_HEADER_BYTES);
            }
            if (this.pending.byteLength < this.bodyLength) break;
            const body = this.pending.toString('utf8', 0, this.bodyLength);
            this.pending = this.pending.subarray(this.bodyLength);
            this.bodyLength = undefined;
            try {
                messages.push(JSON.parse(body));
            } catch (error) {
                throw new DebuggerFramingError(
                    `A frame's body is not JSON: ${error instanceof Error ? error.message : error}`
                );
            }
        }
        return messages;
    }
}
