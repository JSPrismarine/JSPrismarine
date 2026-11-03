import assert from 'assert';
import BitFlags from './BitFlags';
import Frame from './Frame';
import Packet from './Packet';

// https://github.com/facebookarchive/RakNet/blob/1a169895a900c9fc4841c556e16514182b75faf8/Source/ReliabilityLayer.cpp#L133
export const DATAGRAM_HEADER_BYTE_LENGTH = 6;

/**
 * A Frame costs at least 4 bytes on the wire (3 byte header + 1 byte of content), so a
 * datagram of any sane size cannot legitimately hold more than this. Bounds how many
 * objects a single oversized UDP datagram can make us allocate.
 */
const MAX_FRAMES_PER_DATAGRAM = 512;

export default class FrameSet extends Packet {
    public constructor(buffer?: Buffer) {
        super(BitFlags.VALID, buffer);
    }

    public sequenceNumber!: number;
    public frames: Frame[] = [];

    /**
     * The header byte has already been consumed by {@link Packet.decode}, and its low bits
     * are not consulted: `CONTINUOUS_SEND`, `NEEDS_B_AND_AS` and the packet pair bit are
     * hints for RakNet's congestion control that the sliding window variant Bedrock uses
     * reads and discards. They are not set on the way out for the same reason.
     * @see https://github.com/facebookarchive/RakNet/blob/master/Source/CCRakNetSlidingWindow.cpp#L128
     */
    public decodePayload(): void {
        this.sequenceNumber = this.readUnsignedTriadLE();
        this.frames = [];
        do {
            if (this.frames.length >= MAX_FRAMES_PER_DATAGRAM) {
                throw new Error(`Datagram holds more than ${MAX_FRAMES_PER_DATAGRAM} frames`);
            }
            this.frames.push(new Frame().fromBinary(this));
        } while (!this.feof());
    }

    /**
     * Builds the datagram in one preallocated buffer instead of appending frame by frame.
     *
     * This overrides {@link Packet.encode} rather than filling in `encodePayload` because
     * the whole point is to know the final size before writing the first byte:
     * {@link getByteLength} already gives it exactly. The copy send path and callers that
     * inspect `getBuffer()` keep this cached contiguous encoding.
     */
    public encode(): void {
        const out = Buffer.allocUnsafe(this.getByteLength());

        out[0] = this.getId();
        let offset = out.writeUIntLE(this.sequenceNumber, 1, 3);
        for (const frame of this.frames) {
            offset = frame.writeInto(out, offset);
        }

        // getByteLength and writeInto have to agree on every field, or a datagram goes out
        // with a tail of uninitialized memory. Cheap to check once per datagram, and it
        // turns a silent wire corruption into a loud failure.
        assert(offset === out.byteLength, `FrameSet encoded ${offset} bytes, expected ${out.byteLength}`);

        this.setBuffer(out);
    }

    public getByteLength(): number {
        let length = 4; // header (1 byte) + triad (3 bytes)
        for (const frame of this.frames) {
            length += frame.getByteLength();
        }
        return length;
    }

    /**
     * Returns the datagram as headers and existing frame payloads, without copying payload
     * bytes into a new full-size buffer. Node's dgram socket sends these parts as one UDP
     * datagram. Callers must keep the frame content alive until the send callback runs.
     * @returns The datagram as a sequence of header buffers and the original frame contents.
     */
    public toBuffers(): Buffer[] {
        let headerLength = 4;
        for (const frame of this.frames) headerLength += frame.getByteLength() - frame.content.byteLength;

        const headers = Buffer.allocUnsafe(headerLength);
        headers[0] = this.getId();
        let offset = headers.writeUIntLE(this.sequenceNumber, 1, 3);
        const parts: Buffer[] = [headers.subarray(0, offset)];

        for (const frame of this.frames) {
            const start = offset;
            offset = frame.writeHeaderInto(headers, offset);
            parts.push(headers.subarray(start, offset), frame.content);
        }

        assert(offset === headers.byteLength, `FrameSet wrote ${offset} header bytes, expected ${headers.byteLength}`);
        return parts;
    }
}
