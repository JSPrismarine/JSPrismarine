import NetworkPacket from '../NetworkPacket';
import { PacketIdentifier } from '../PacketIdentifier';

import type NetworkBinaryStream from '../NetworkBinaryStream';

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
 * Starts or stops video capture on the client. Mojang marks the packet internal; a test
 * command sends it.
 *
 * Protocol 2193 layout: one byte that picks between `Start Video Capture` and
 * `Stop Video Capture`, then for a start the `FrameRate` as a little-endian uint32 and the
 * `FilePrefix` string. A stop ends after the first byte.
 *
 * The schema lists two `oneOf<Start Video Capture, Stop Video Capture>` fields with no
 * selector of their own. The packet kept its legacy serializer when it gained Cereal support,
 * so the wire is a bool (true means start) followed by the start fields, as gophertunnel and
 * PocketMine write it at 2193. The client reads the byte as a bool, so any non-zero value
 * starts a capture.
 */
export default class PlayerVideoCapturePacket extends NetworkPacket<PlayerVideoCapture> {
    public get id(): number {
        return PacketIdentifier.PLAYER_VIDEO_CAPTURE;
    }

    protected serializePayload(stream: NetworkBinaryStream, data: PlayerVideoCapture): void {
        stream.writeByte(data.action);

        if (data.action === PlayerVideoCaptureAction.STOP) return;

        stream.writeUnsignedIntLE(data.frameRate);
        stream.writeString(data.filePrefix);
    }

    protected deserializePayload(stream: NetworkBinaryStream): PlayerVideoCapture {
        if (!stream.readBoolean()) return { action: PlayerVideoCaptureAction.STOP };

        return {
            action: PlayerVideoCaptureAction.START,
            frameRate: stream.readUnsignedIntLE(),
            filePrefix: stream.readString()
        };
    }
}
