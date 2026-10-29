import AnimatePacket from './AnimatePacket';
import { HandSlot } from './InventoryTransactionPacket';

/**
 * `AnimatePacket` at protocol 2225, which appends one field to the 2193 layout: `Hand` as a
 * plain trailing uint8 - no presence byte, unlike the swing source before it.
 *
 * Verified against the v1.26.60 `metadata.zip` (`AnimatePacketPayload.json`, `Hand` at
 * ordinal 4) and gophertunnel's `Animate.Marshal` at v1.63.0 (`io.Uint8(&pk.Hand)` last),
 * which agree. Nothing before it changed.
 */
export default class AnimatePacket2225 extends AnimatePacket {
    /** Hand: which hand is animating, a {@link HandSlot} byte. */
    public hand: number = HandSlot.MAINHAND;

    /** The base packet's name, so handlers and name-keyed id lookups never see the version suffix. */
    public override getName(): string {
        return 'AnimatePacket';
    }

    /** Writes the 2193 fields, then the trailing Hand byte. */
    public override encodePayload(): void {
        super.encodePayload();
        this.writeByte(this.hand);
    }

    /** Reads the 2193 fields back, then the trailing Hand byte. */
    public override decodePayload(): void {
        super.decodePayload();
        this.hand = this.readByte();
    }
}
