import type { Vector3 } from '@jsprismarine/math';
import Identifiers from '../Identifiers';
import { NetworkUtil } from '../NetworkUtil';
import DataPacket from './DataPacket';

/**
 * The docs' `InteractPacket::Action`: what the client did to the target actor, written as a
 * uint8.
 *
 * The 1.26.50 docs page numbers the members 1 to 4, but clients send 3 to 6, which is what
 * the page's own 2207 changelog and gophertunnel record.
 */
export enum InteractAction {
    Invalid = 0,
    StopRiding = 3,
    InteractUpdate = 4,
    NpcOpen = 5,
    OpenInventory = 6
}

/**
 * Sent by the client when it interacts with an actor, or presses the inventory button.
 *
 * Protocol 2193 layout: Action as a uint8, Target Runtime ID as a varuint64, then Position as
 * an optional Vec3: a presence byte, followed by three little-endian floats when it is 0x01.
 */
export default class InteractPacket extends DataPacket {
    public static NetID = Identifiers.InteractPacket;

    public action!: number;
    public target!: bigint;

    /** The Position field. Null when the client sent the optional as absent. */
    public position: Vector3 | null = null;

    public encodePayload(): void {
        this.writeByte(this.action);
        this.writeUnsignedVarLong(this.target);

        this.writeBoolean(this.position !== null);
        if (this.position !== null) {
            NetworkUtil.writeVector3(this, this.position);
        }
    }

    public decodePayload(): void {
        this.action = this.readByte();
        this.target = this.readUnsignedVarLong();

        // The position is an optional: a presence byte, then the three floats when it is set.
        this.position = this.readBoolean() ? NetworkUtil.readVector3(this) : null;
    }
}
