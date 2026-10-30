import { layoutAt, updateBlockPacket } from '@jsprismarine/protocol';

import DataPacket from './DataPacket';

/** Which of a position's two block layers an update targets. */
export enum UpdateBlockLayerType {
    /** The block itself. */
    Normal = 0,
    /** The waterlogging layer, holding the water or lava the block sits in. */
    Liquid = 1
}

/**
 * How the client applies a block change, as the bits of vanilla's `BlockUpdateFlag`.
 *
 * `Network` is the bit a server-driven change carries; a Bedrock Dedicated Server broadcasts
 * its own block changes with `Neighbors | Network`, and sometimes `Priority` on top.
 */
export enum UpdateBlockFlagsType {
    None = 0b0000,
    /** Let the neighboring blocks react to the change. */
    Neighbors = 0b0001,
    /** The change came over the network. */
    Network = 0b0010,
    /** Skip re-rendering the chunk the block is in. */
    NoGraphic = 0b0100,
    /** Re-render ahead of other pending chunk updates. */
    Priority = 0b1000
}

/**
 * One block changing at one position.
 *
 * **Bound To:** Client
 *
 * Protocol 2193 layout (docs id 21), in wire order:
 *
 * | Name | Type | Notes |
 * | ---- |:----:|:-----:|
 * | Block Position | BlockPos | Three ZigZag varint32 |
 * | Block Runtime ID | varuint32 | The FNV-1a hash of the block's state, see `BlockRuntimeIds` |
 * | Flags | varuint32 | {@link UpdateBlockFlagsType} bits |
 * | Layer | varuint32 | {@link UpdateBlockLayerType} |
 *
 * The height is signed like the other two coordinates. It was a varuint32 until 1.26.10, when
 * every `NetworkBlockPosition` in the protocol became a `BlockPos`.
 * @see https://mojang.github.io/bedrock-protocol-docs/1.26.51/packets/update-block-packet/
 */
export default class UpdateBlockPacket extends DataPacket {
    public x = 0;
    public y = 0;
    public z = 0;

    /** Block Runtime ID, the hashed id of the state that now stands at the position. */
    public blockRuntimeId = 0;

    public flags: UpdateBlockFlagsType = UpdateBlockFlagsType.None;
    public layer: UpdateBlockLayerType = UpdateBlockLayerType.Normal;

    /** Reads the position, the block and how to apply it. */
    public decodePayload(): void {
        const read = layoutAt(updateBlockPacket, this.codecProtocol).decode(this);
        this.x = read.position.x;
        this.y = read.position.y;
        this.z = read.position.z;
        this.blockRuntimeId = read.blockRuntimeId;
        this.flags = read.flags;
        this.layer = read.layer;
    }

    /** Writes the position, the block and how to apply it. */
    public encodePayload(): void {
        layoutAt(updateBlockPacket, this.codecProtocol).encode(this, {
            position: { x: this.x, y: this.y, z: this.z },
            blockRuntimeId: this.blockRuntimeId,
            flags: this.flags,
            layer: this.layer
        });
    }
}
