import { Vector3 } from '@jsprismarine/math';
import { changeDimensionPacket, layoutAt } from '@jsprismarine/protocol';

import FieldNetworkPacket from '@jsprismarine/protocol/FieldNetworkPacket';

import type { Dimension } from '@jsprismarine/minecraft';

/**
 * Starts a dimension change and the loading screen that goes with it.
 *
 * The wire layout lives in `@jsprismarine/protocol`'s `changeDimensionPacket` definition:
 * `Dimension ID` as a ZigZag varint32, `Position` as a `Vec3`, `Respawn` as a boolean and
 * `Loading Screen Id` as a presence byte followed by a little endian uint32 when present.
 *
 * `Dimension ID` has to differ from the one the player is already in. Sending the current
 * dimension leaves the client on the change screen for ever.
 *
 * **Bound To:** Client
 * @see https://mojang.github.io/bedrock-protocol-docs/1.26.51/packets/change-dimension-packet/
 */
export default class ChangeDimensionPacket extends FieldNetworkPacket {
    /** `Dimension ID`, numbered as {@link Dimension}: 0 the Overworld, 1 the Nether, 2 the End, 3 undefined. */
    public dimension!: Dimension;
    /** `Position` in the new dimension. Null writes the origin. */
    public position!: Vector3 | null;
    /** `Respawn`: whether the change followed a death rather than a portal. */
    public respawn!: boolean;

    /**
     * `Loading Screen Id`, or null for no loading screen. Has to be unique among the screens
     * still open, since `ServerboundLoadingScreenPacket` reports progress against it.
     * `PlayerSession.beginLoadingScreen` hands out such ids.
     */
    public loadingScreenId: number | null = null;

    /** Reads the dimension, the arrival position, the respawn flag and the screen id. */
    public decodePayload(): void {
        const read = layoutAt(changeDimensionPacket, this.codecProtocol).decode(this);
        this.dimension = read.dimension;
        this.position = read.position;
        this.respawn = read.respawn;
        this.loadingScreenId = read.loadingScreenId;
    }

    /** Writes the dimension, the arrival position, the respawn flag and the screen id. */
    public encodePayload(): void {
        layoutAt(changeDimensionPacket, this.codecProtocol).encode(this, {
            dimension: this.dimension,
            position: this.position ?? Vector3.ZERO,
            respawn: this.respawn,
            loadingScreenId: this.loadingScreenId
        });
    }
}
