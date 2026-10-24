import Identifiers from '../Identifiers';
import { NetworkUtil } from '../NetworkUtil';
import DataPacket from './DataPacket';

/**
 * Triggers an animation on an actor, in either direction.
 *
 * Protocol 2193 layout: Action as a uint8, Target Actor Runtime ID as a varuint64, Data as a
 * float, then Swing Source as an optional string (presence byte, then the string) naming what
 * caused a swing: "None", "Build", "Mine", "Interact", "Attack", "UseItem", "ThrowItem",
 * "DropItem" or "Event". The action is relayed as the raw byte; the 1.26.50 docs number WakeUp,
 * CriticalHit and MagicCriticalHit as 2, 3 and 4, while the 2207 changelog and other servers
 * use 3, 4 and 5.
 */
export default class AnimatePacket extends DataPacket {
    public static NetID = Identifiers.AnimatePacket;

    /** Action, as the raw enum byte. Swing is 1. */
    public action!: number;

    /** Target Actor Runtime ID. */
    public runtimeEntityId!: bigint;

    /** Data. Meaning depends on the action; zero for the ones that carry nothing. */
    public data = 0;

    /** Swing Source: what caused the swing, by name, or `null` when absent. */
    public swingSource: string | null = null;

    /** Writes the four fields in docs order, with the swing source behind a presence byte. */
    public encodePayload(): void {
        this.writeByte(this.action);
        this.writeUnsignedVarLong(this.runtimeEntityId);
        this.writeFloatLE(this.data);

        if (this.swingSource === null) {
            this.writeBoolean(false);
        } else {
            this.writeBoolean(true);
            NetworkUtil.writeString(this, this.swingSource);
        }
    }

    /** Reads the four fields in docs order; an absent swing source becomes `null`. */
    public decodePayload(): void {
        this.action = this.readByte();
        this.runtimeEntityId = this.readUnsignedVarLong();
        this.data = this.readFloatLE();
        this.swingSource = this.readBoolean() ? NetworkUtil.readString(this) : null;
    }
}
