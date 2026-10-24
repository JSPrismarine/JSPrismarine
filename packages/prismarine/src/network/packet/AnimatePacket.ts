import Identifiers from '../Identifiers';
import { NetworkUtil } from '../NetworkUtil';
import DataPacket from './DataPacket';

/**
 * Triggers an animation on an actor, in either direction.
 *
 * Protocol 2193 layout, with the docs' field names: `Action` as a uint8, `Target Actor
 * Runtime ID` as a varuint64, `Data` as a little-endian float, then `Swing Source` as an
 * optional string - a presence byte, then the string when it is 0x01 - naming what caused a
 * swing. A client writes the name in lower case: "none", "build", "mine", "interact",
 * "attack", "useitem", "throwitem", "dropitem" or "event".
 *
 * The action is relayed as the raw byte, and the byte is not the number printed beside the
 * name on the docs page. That table prints list indices; the values a 2193 client sends are
 * NoAction 0, Swing 1, WakeUp 3, CriticalHit 4 and MagicCriticalHit 5, which is what the
 * page's own 2207 changelog corrects them to and what gophertunnel reads at 2193.
 */
export default class AnimatePacket extends DataPacket {
    public static NetID = Identifiers.AnimatePacket;

    /** `Action`, as the raw enum byte. Swing is 1. */
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
