import Identifiers from '../Identifiers';
import { NetworkUtil } from '../NetworkUtil';
import DataPacket from './DataPacket';

/**
 * The `Action` byte of `AnimatePacket`.
 *
 * The 1.26.51 docs page prints the members 0 to 4, but that table shows list positions. A
 * 2193 client sends the numbers below: the page's own 2207 changelog "changes" WakeUp,
 * CriticalHit and MagicCriticalHit to 3, 4 and 5, and gophertunnel and PocketMine have read
 * them so for years. Nothing is 2.
 */
export enum AnimateAction {
    NoAction = 0,
    Swing = 1,
    WakeUp = 3,
    CriticalHit = 4,
    MagicCriticalHit = 5
}

/**
 * Triggers an animation on an actor, in either direction.
 *
 * Protocol 2193 layout, with the docs' field names: `Action` as a uint8, `Target Actor
 * Runtime ID` as a varuint64, `Data` as a little-endian float, then `Swing Source` as an
 * optional string - a presence byte, then the string when it is 0x01 - naming what caused a
 * swing. A client writes the name in lower case: "none", "build", "mine", "interact",
 * "attack", "useitem", "throwitem", "dropitem" or "event".
 */
export default class AnimatePacket extends DataPacket {
    public static NetID = Identifiers.AnimatePacket;

    /** `Action`, as the raw byte. See {@link AnimateAction} for the numbers. */
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
