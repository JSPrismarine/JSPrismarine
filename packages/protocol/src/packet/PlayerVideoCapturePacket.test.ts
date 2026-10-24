import { describe, expect, it } from 'vitest';

import NetworkBinaryStream from '../NetworkBinaryStream';
import PlayerVideoCapturePacket, { PlayerVideoCaptureAction } from './PlayerVideoCapturePacket';

import type { PlayerVideoCapture } from './PlayerVideoCapturePacket';

const START: PlayerVideoCapture = {
    action: PlayerVideoCaptureAction.START,
    frameRate: 30,
    filePrefix: 'Frame_'
};

/** `START` on the wire, header included, written by hand in the order the docs list the fields. */
const START_BYTES = Buffer.from([
    ...[0xc4, 0x02], // packet id header, 324 as a varuint32
    0x01, // Start Video Capture
    ...[0x1e, 0x00, 0x00, 0x00], // FrameRate 30, little-endian uint32
    ...[0x06, 0x46, 0x72, 0x61, 0x6d, 0x65, 0x5f] // FilePrefix "Frame_"
]);

const STOP: PlayerVideoCapture = { action: PlayerVideoCaptureAction.STOP };

/** `STOP` on the wire: the header and the Stop Video Capture byte, nothing after it. */
const STOP_BYTES = Buffer.from([0xc4, 0x02, 0x00]);

describe('PlayerVideoCapturePacket', () => {
    it('writes a start with its frame rate and file prefix', () => {
        const buffer = new PlayerVideoCapturePacket(START).serialize(new NetworkBinaryStream());

        expect([...buffer]).toEqual([...START_BYTES]);
    });

    it('reads a hand-built start to its end', () => {
        const stream = new NetworkBinaryStream(START_BYTES);
        const data = new PlayerVideoCapturePacket().deserialize(stream);

        expect(data).toEqual(START);
        expect(stream.feof()).toBe(true);
    });

    it('writes a stop as a single zero byte', () => {
        const buffer = new PlayerVideoCapturePacket(STOP).serialize(new NetworkBinaryStream());

        expect([...buffer]).toEqual([...STOP_BYTES]);
    });

    it('reads a stop without touching the bytes after it', () => {
        const stream = new NetworkBinaryStream(Buffer.concat([STOP_BYTES, Buffer.from([0xff])]));
        const data = new PlayerVideoCapturePacket().deserialize(stream);

        expect(data).toEqual(STOP);
        expect(stream.readByte()).toBe(0xff);
    });
});
