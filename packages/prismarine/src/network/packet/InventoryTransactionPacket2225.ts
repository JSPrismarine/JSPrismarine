import InventoryTransactionPacket, { HandSlot, TransactionType } from './InventoryTransactionPacket';

/**
 * `InventoryTransactionPacket` at protocol 2225, which adds a `Hand` uint8 to two of the
 * typed bodies: into the use-item-on-actor body between the hotbar slot and the item, and at
 * the end of the release-item body after the player position. The other bodies are
 * unchanged, and the use-item body keeps the hand it already had at 2193.
 *
 * Verified against the v1.26.60 `metadata.zip` (`ItemUseOnActorInventoryTransaction.json`,
 * `ItemReleaseInventoryTransaction.json`) and gophertunnel's
 * `UseItemOnEntityTransactionData.Marshal` / `ReleaseItemTransactionData.Marshal` at
 * v1.63.0, which agree.
 */
export default class InventoryTransactionPacket2225 extends InventoryTransactionPacket {
    /** Hand: which hand a use-on-actor or release transaction acted from, a {@link HandSlot} byte. */
    public hand: number = HandSlot.MAINHAND;

    /** The base packet's name, so handlers and name-keyed id lookups never see the version suffix. */
    public override getName(): string {
        return 'InventoryTransactionPacket';
    }

    protected override encodeItemUseOnActorHand(): void {
        this.writeByte(this.hand);
    }

    protected override decodeItemUseOnActorHand(): void {
        this.hand = this.readByte();
    }

    /** Writes the 2193 layout with the hand seam filled, then the trailing release-item Hand. */
    public override encodePayload(): void {
        super.encodePayload();
        // The release-item body gained a trailing Hand; it is the last field of the packet.
        if (this.transactionType === TransactionType.RELEASE_ITEM) this.writeByte(this.hand);
    }

    /** Reads the 2193 layout with the hand seam filled, then the trailing release-item Hand. */
    public override decodePayload(): void {
        super.decodePayload();
        if (this.transactionType === TransactionType.RELEASE_ITEM) this.hand = this.readByte();
    }
}
