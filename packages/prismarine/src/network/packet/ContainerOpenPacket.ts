import { Vector3 } from '@jsprismarine/math';
import Identifiers from '../Identifiers';
import DataPacket from './DataPacket';

/**
 * Opens a container for the client.
 *
 * The position is a **block** position, and one of an entity's own containers - a player's
 * inventory among them - carries no position at all, only the actor it belongs to. This used
 * to send the player's own position, which is a floating point one: written through a varint
 * it became whichever block the player happened to be standing in.
 *
 * **Bound To:** Client
 */
export default class ContainerOpenPacket extends DataPacket {
    public static NetID = Identifiers.ContainerOpenPacket;
    public windowId!: number;
    public containerType!: number;

    /** Zero for a container an actor carries; only a block's container has a position. */
    public containerPos: Vector3 = new Vector3(0, 0, 0);
    public containerEntityId!: bigint;

    public encodePayload(): void {
        this.writeByte(this.windowId);
        this.writeByte(this.containerType);

        // All three signed. The unsigned height here was the layout up to protocol 924; it
        // moved to a signed `BlockPos` long before 2193, and every other block position in this
        // server already writes it that way. A y of 64 reached the client as 32, so the window
        // named a position that held no container.
        this.writeVarInt(Math.floor(this.containerPos.getX()));
        this.writeVarInt(Math.floor(this.containerPos.getY()));
        this.writeVarInt(Math.floor(this.containerPos.getZ()));

        this.writeVarLong(this.containerEntityId);
    }

    public decodePayload(): void {
        this.windowId = this.readByte();
        this.containerType = this.readByte();

        this.containerPos = new Vector3(this.readVarInt(), this.readVarInt(), this.readVarInt());

        this.containerEntityId = this.readVarLong();
    }
}
