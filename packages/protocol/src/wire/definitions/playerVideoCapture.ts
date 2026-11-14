/**
 * `PlayerVideoCapturePacket`: starts or stops video capture on the client.
 *
 * Mojang marks the packet internal; a test command sends it. The schema lists two
 * `oneOf<Start Video Capture, Stop Video Capture>` fields with no selector of their own. The
 * packet kept its legacy serializer when it gained Cereal support, so the wire is one byte read
 * as a bool (true means start), then for a start the `FrameRate` as a little-endian uint32 and
 * the `FilePrefix` string, as gophertunnel and PocketMine write it at 2193. A stop ends after
 * the first byte.
 */
import { definePacket } from '../define';
import * as t from '../fieldTypes';

import type { PayloadOf } from '../define';

/** Which alternative a `PlayerVideoCapturePacket` carries, as the byte that opens the payload. */
export enum PlayerVideoCaptureAction {
    /** `Stop Video Capture`: no further fields. */
    STOP = 0,
    /** `Start Video Capture`: `FrameRate` and `FilePrefix` follow. */
    START = 1
}

/** The fields of a `PlayerVideoCapturePacket`. `action` picks the alternative and its fields. */
export type PlayerVideoCapture =
    | {
          action: PlayerVideoCaptureAction.START;
          /** `FrameRate` of the capture, a little-endian uint32. */
          frameRate: number;
          /** `FilePrefix` for the frame files the client writes. */
          filePrefix: string;
      }
    | {
          action: PlayerVideoCaptureAction.STOP;
      };

/**
 * The selector byte and the fields it picks, as one wire type: a flat field list cannot carry
 * fields that exist for only one value of another. The client reads the byte as a bool, so any
 * non-zero value starts a capture.
 */
const videoCapture = t.custom<PlayerVideoCapture>(
    'oneOf<Start Video Capture, Stop Video Capture>',
    (stream, data) => {
        t.uint8.write(stream, data.action);

        if (data.action === PlayerVideoCaptureAction.STOP) return;

        t.lu32.write(stream, data.frameRate);
        t.string.write(stream, data.filePrefix);
    },
    (stream) => {
        if (!t.bool.read(stream)) return { action: PlayerVideoCaptureAction.STOP };

        return {
            action: PlayerVideoCaptureAction.START,
            frameRate: t.lu32.read(stream),
            filePrefix: t.string.read(stream)
        };
    }
);

/** The fields sent to start or stop video capture on one client. */
export const playerVideoCapturePacket = definePacket('PlayerVideoCapturePacket', {
    /** `Start Video Capture` with its frame rate and file prefix, or `Stop Video Capture`. */
    capture: videoCapture
});

/** Payload the layout derives for `PlayerVideoCapturePacket`: the capture request, wrapped in one field. */
export type PlayerVideoCapturePayload = PayloadOf<typeof playerVideoCapturePacket>;
