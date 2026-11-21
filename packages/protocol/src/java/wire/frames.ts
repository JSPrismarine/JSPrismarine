/**
 * Java Edition's frames on its TCP stream: each one a VarInt byte length, then that many bytes.
 *
 * A length takes at most three bytes, so no frame is longer than 2,097,151 bytes, as the
 * community protocol page and the vanilla server both have it. A longer length is refused rather
 * than waited for, so a client cannot make the server hold megabytes for a frame.
 */

/** The longest frame a three-byte length can name. */
export const MAX_JAVA_FRAME = 2_097_151;

/** The most bytes a frame's length may take. */
const MAX_LENGTH_BYTES = 3;

/**
 * Prefixes a frame with its length.
 * @param frame - The frame's bytes.
 * @returns The bytes to write to the socket.
 */
export const framed = (frame: Buffer): Buffer => {
    const length: number[] = [];
    let value = frame.byteLength;
    do {
        let byte = value & 0x7f;
        value >>>= 7;
        if (value !== 0) byte |= 0x80;
        length.push(byte);
    } while (value !== 0);
    return Buffer.concat([Buffer.from(length), frame]);
};

/** What {@link JavaFrameReader.push} found: the whole frames, or why the stream is unreadable. */
export type JavaFrames = { readonly frames: readonly Buffer[] } | { readonly malformed: string };

/** Splits one connection's stream into frames, keeping a partial frame until the rest arrives. */
export class JavaFrameReader {
    private pending: Buffer = Buffer.alloc(0);

    /**
     * Adds bytes that arrived and returns every frame they complete.
     * @param chunk - The bytes the socket read.
     * @returns The completed frames, or why the stream cannot be read past here.
     */
    public push(chunk: Buffer): JavaFrames {
        this.pending = this.pending.byteLength === 0 ? chunk : Buffer.concat([this.pending, chunk]);
        const frames: Buffer[] = [];
        let offset = 0;
        for (;;) {
            let length = 0;
            let read = 0;
            let complete = false;
            while (read < MAX_LENGTH_BYTES && offset + read < this.pending.byteLength) {
                const byte = this.pending[offset + read]!;
                length |= (byte & 0x7f) << (7 * read);
                read += 1;
                if ((byte & 0x80) === 0) {
                    complete = true;
                    break;
                }
            }
            if (!complete) {
                if (read === MAX_LENGTH_BYTES) return { malformed: `a frame length longer than ${read} bytes` };
                break;
            }
            if (offset + read + length > this.pending.byteLength) break;
            frames.push(this.pending.subarray(offset + read, offset + read + length));
            offset += read + length;
        }
        this.pending = this.pending.subarray(offset);
        return { frames };
    }
}
