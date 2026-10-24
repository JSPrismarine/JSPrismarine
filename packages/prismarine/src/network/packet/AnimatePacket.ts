import Identifiers from '../Identifiers';
import { NetworkUtil } from '../NetworkUtil';
import DataPacket from './DataPacket';

/**
 * An animation played on an entity, and the swing every mined block starts with.
 *
 * The layout moved on at 1.21.130 and this had stayed behind on all three counts:
 *
 * - The action is a plain byte. It used to be a signed varint, so an arm swing - action 1 -
 *   went out zig-zagged as `0x02`, which the client reads as `WakeUp`: the wrong animation
 *   even before the length went wrong.
 * - The float that follows is unconditional. It used to be written only for the two rowing
 *   actions, behind an `action & 0x80` test, and those actions no longer exist.
 * - A swing source was added after it, optional, as a string naming what caused the swing.
 *
 * The last two together left the packet five bytes short, so a real client read past its end,
 * called it malformed and hung up - which is what `initialconnection-90` says and nothing more.
 * It is re-broadcast to everyone watching on every swing, so mining a single block was enough.
 */
export default class AnimatePacket extends DataPacket {
    public static NetID = Identifiers.AnimatePacket;

    public action!: number;
    public runtimeEntityId!: bigint;

    /** Meaning depends on the action; zero for the ones that carry nothing. */
    public data = 0;

    /** What caused the swing, by name, or `null` for the packets that do not say. */
    public swingSource: string | null = null;

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

    public decodePayload(): void {
        this.action = this.readByte();
        this.runtimeEntityId = this.readUnsignedVarLong();
        this.data = this.readFloatLE();
        this.swingSource = this.readBoolean() ? NetworkUtil.readString(this) : null;
    }
}
