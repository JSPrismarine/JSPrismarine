/**
 * The debugger protocol's framing: each message is its length as 8 hexadecimal digits and a
 * newline, then that many bytes of JSON that end in a newline. The extension writes it in
 * `Session.sendDebuggeeMessage` and reads it in `src/message-stream-parser.ts`; koush's
 * `quickjs-debugger.c` writes the same bytes ("length prefix is 8 hex followed by newline").
 */

import { ScriptHostErrors } from '@jsprismarine/errors/script-host';

/** The bytes of a frame's length header: 8 hexadecimal digits and a newline. */
export const FRAME_HEADER_BYTES = 9;

/** The largest length a header can state, its body's JSON and newline together. */
export const MAX_FRAME_LENGTH = 0xffffffff;

/**
 * The largest body the host reads from the extension: 1 MiB. The extension's messages are small,
 * and the largest carry what a person writes: an `evaluate` expression, a command, or one file's
 * breakpoint lines in `setBreakpoints`. A breakpoint list reaches the engine through its transfer
 * buffer, `DEFAULT_BUFFER_SIZE` (64 KiB) unless an engine sets another size, and the limit is 16
 * times that, which leaves room for a pasted expression. A peer has given no passcode before its
 * first message decodes, so a header that states more is refused before its body is buffered.
 */
export const MAX_RECEIVED_FRAME_LENGTH = 1024 * 1024;

/**
 * Frames one message.
 * @param message - The message, which JSON can encode.
 * @returns The header, the JSON and its trailing newline.
 */
export const encodeFrame = (message: unknown): Buffer => {
    const json = Buffer.from(JSON.stringify(message), 'utf8');
    const length = json.byteLength + 1;
    if (length > MAX_FRAME_LENGTH) throw new ScriptHostErrors.FrameTooLong({ length });
    return Buffer.concat([Buffer.from(`${length.toString(16).padStart(8, '0')}\n`, 'ascii'), json, Buffer.from('\n')]);
};

/**
 * Splits the bytes of a connection into messages, whatever sizes the chunks arrive in. The
 * extension reads each body as JSON whole, so a body's trailing newline is part of the JSON's
 * whitespace and the decoder does not require it. Chunks wait in a list until a header or a body
 * is complete, so each byte is copied at most once more however small the chunks are.
 */
export class FrameDecoder {
    private readonly chunks: Buffer[] = [];
    private buffered = 0;
    private bodyLength: number | undefined;

    /**
     * Takes the next chunk of bytes.
     * @returns The messages the bytes so far complete, in order.
     * @throws {DebuggerFramingError} When a header is not 8 hexadecimal digits and a newline, a header states a body
     * longer than {@link MAX_RECEIVED_FRAME_LENGTH}, or a body is not JSON.
     */
    public push(chunk: Uint8Array): unknown[] {
        if (chunk.byteLength > 0) {
            this.chunks.push(Buffer.from(chunk));
            this.buffered += chunk.byteLength;
        }
        const messages: unknown[] = [];
        for (;;) {
            if (this.bodyLength === undefined) {
                if (this.buffered < FRAME_HEADER_BYTES) break;
                const header = this.take(FRAME_HEADER_BYTES).toString('ascii');
                if (!/^[0-9a-fA-F]{8}\n$/.test(header)) {
                    throw new ScriptHostErrors.InvalidFrameHeader({ header: JSON.stringify(header) });
                }
                const length = Number.parseInt(header.slice(0, 8), 16);
                if (length > MAX_RECEIVED_FRAME_LENGTH) {
                    throw new ScriptHostErrors.ReceivedFrameTooLong({ length, limit: MAX_RECEIVED_FRAME_LENGTH });
                }
                this.bodyLength = length;
            }
            if (this.buffered < this.bodyLength) break;
            const body = this.take(this.bodyLength).toString('utf8');
            this.bodyLength = undefined;
            try {
                messages.push(JSON.parse(body));
            } catch (error) {
                throw new ScriptHostErrors.FrameBodyNotJson(
                    { reason: error instanceof Error ? error.message : error },
                    { cause: error }
                );
            }
        }
        return messages;
    }

    /** Removes the first `length` buffered bytes, copying them only when they span chunks. */
    private take(length: number): Buffer {
        this.buffered -= length;
        const first = this.chunks[0];
        if (first !== undefined && first.byteLength >= length) {
            if (first.byteLength === length) this.chunks.shift();
            else this.chunks[0] = first.subarray(length);
            return first.subarray(0, length);
        }
        // One splice takes every chunk the bytes span, and one copy joins them. The bytes of the
        // last chunk past `length` go back uncopied.
        let spanned = 0;
        let covered = 0;
        for (; covered < length && spanned < this.chunks.length; spanned++) {
            covered += this.chunks[spanned]?.byteLength ?? 0;
        }
        const parts = this.chunks.splice(0, spanned);
        const last = parts.pop();
        if (last !== undefined) {
            const kept = last.byteLength - (covered - length);
            parts.push(last.subarray(0, kept));
            if (kept < last.byteLength) this.chunks.unshift(last.subarray(kept));
        }
        return Buffer.concat(parts, length);
    }
}
