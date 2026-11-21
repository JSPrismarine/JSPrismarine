import NetworkPacket from '../../NetworkPacket';
import { PacketIdentifier } from '../PacketIdentifier';
import { PlayerVideoCaptureAction, playerVideoCapturePacket } from '../wire/definitions/playerVideoCapture';
import { layoutAt } from '../../wire/WireLayout';

import type NetworkBinaryStream from '../../NetworkBinaryStream';
import type { PlayerVideoCapture } from '../wire/definitions/playerVideoCapture';

export { PlayerVideoCaptureAction };
export type { PlayerVideoCapture };

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
 *
 * @see https://mojang.github.io/bedrock-protocol-docs/1.26.60/packets/player-video-capture-packet/
 */
export default class PlayerVideoCapturePacket extends NetworkPacket<PlayerVideoCapture> {
    public get id(): number {
        return PacketIdentifier.PLAYER_VIDEO_CAPTURE;
    }

    protected serializePayload(stream: NetworkBinaryStream, data: PlayerVideoCapture): void {
        layoutAt(playerVideoCapturePacket, this.codecProtocol).encode(stream, { capture: data });
    }

    protected deserializePayload(stream: NetworkBinaryStream): PlayerVideoCapture {
        return layoutAt(playerVideoCapturePacket, this.codecProtocol).decode(stream).capture;
    }
}
