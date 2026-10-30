import { Vector3 } from '@jsprismarine/math';

import FieldNetworkPacket from '../FieldNetworkPacket';
import { layoutAt } from '../wire/WireLayout';
import { containerOpenPacket } from '../wire/definitions/containers';

/**
 * Opens a container for the client.
 *
 * The position is a **block** position, and one of an entity's own containers - a player's
 * inventory among them - carries no position at all, only the actor it belongs to. This used
 * to send the player's own position, which is a floating point one: written through a varint
 * it became whichever block the player happened to be standing in.
 *
 * Wire order at protocol 2193: `Container Id` (uint8), `Container Type` (uint8), `Position`
 * (a `BlockPos` of three varint32s), `Target Actor ID` (varint64).
 *
 * **Bound To:** Client
 */
export default class ContainerOpenPacket extends FieldNetworkPacket {
    /** `Container Id`: the window the client should file this container under. */
    public windowId!: number;

    /** `Container Type`: which screen to draw. */
    public containerType!: number;

    /** `Position`. Zero for a container an actor carries; only a block's has a position. */
    public containerPos: Vector3 = new Vector3(0, 0, 0);

    /** `Target Actor ID`: the actor whose container this is, or -1 for a block's. */
    public containerEntityId!: bigint;

    /** Writes the four fields in docs order. */
    public encodePayload(): void {
        // All three coordinates are signed. The unsigned height here was the layout up to
        // protocol 924; it moved to a signed `BlockPos` long before 2193. A y of 64 reached
        // the client as 32, so the window named a position that held no container.
        layoutAt(containerOpenPacket, this.codecProtocol).encode(this, {
            windowId: this.windowId,
            containerType: this.containerType,
            position: {
                x: Math.floor(this.containerPos.getX()),
                y: Math.floor(this.containerPos.getY()),
                z: Math.floor(this.containerPos.getZ())
            },
            containerEntityId: this.containerEntityId
        });
    }

    /** Reads the four fields in docs order. */
    public decodePayload(): void {
        const read = layoutAt(containerOpenPacket, this.codecProtocol).decode(this);
        this.windowId = read.windowId;
        this.containerType = read.containerType;
        this.containerPos = new Vector3(read.position.x, read.position.y, read.position.z);
        this.containerEntityId = read.containerEntityId;
    }
}
