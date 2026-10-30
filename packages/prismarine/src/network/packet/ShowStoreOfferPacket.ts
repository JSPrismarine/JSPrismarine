import UUID from '@jsprismarine/protocol/wire/structures/UUID';
import DataPacket from './DataPacket';

/** Which page the client opens for the offer, as the `Redirect Type` byte numbers it. */
export enum ShowStoreOfferRedirectType {
    MarketplaceOffer = 0,
    DressingRoomOffer = 1,
    ThirdPartyServerPage = 2
}

/**
 * Sends the player to a marketplace offer, a dressing room offer or a server's own store page.
 *
 * Wire order at protocol 2193: `Offer Id` as a uuid written as two uint64 LE halves, most
 * significant first, then `Redirect Type` as a byte.
 *
 * Only partnered servers have offers to point at, so nothing here sends it.
 *
 * **Bound To:** Client
 * @see https://mojang.github.io/bedrock-protocol-docs/1.26.51/packets/show-store-offer-packet/
 */
export default class ShowStoreOfferPacket extends DataPacket {
    /** The offer to look up on the page the redirect type chooses. */
    public offerId: UUID = new UUID();

    public redirectType: ShowStoreOfferRedirectType = ShowStoreOfferRedirectType.MarketplaceOffer;

    /** Reads the offer uuid and the redirect type. */
    public decodePayload(): void {
        this.offerId = UUID.networkDeserialize(this);
        this.redirectType = this.readByte();
    }

    /** Writes the offer uuid and the redirect type. */
    public encodePayload(): void {
        this.offerId.networkSerialize(this);
        this.writeByte(this.redirectType);
    }
}
