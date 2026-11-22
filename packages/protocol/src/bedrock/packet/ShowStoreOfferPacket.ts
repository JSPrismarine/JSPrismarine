import { ShowStoreOfferRedirectType, showStoreOfferPacket } from '../wire/definitions/showStoreOffer';
import { layoutAt } from '../../wire/WireLayout';
import UUID from '../wire/structures/UUID';

import FieldNetworkPacket from '../../FieldNetworkPacket';

export { ShowStoreOfferRedirectType };

/**
 * Sends the player to a marketplace offer, a dressing room offer or a server's own store page.
 *
 * Wire order at protocols 2193 and 2225, which share one layout: `Offer Id` as a uuid written as two uint64 LE halves, most
 * significant first, then `Redirect Type` as a byte.
 *
 * Only partnered servers have offers to point at, so nothing here sends it.
 *
 * **Bound To:** Client
 * @see https://mojang.github.io/bedrock-protocol-docs/1.26.60/packets/show-store-offer-packet/
 */
export default class ShowStoreOfferPacket extends FieldNetworkPacket {
    /** The name this packet's wire id is listed under. */
    public getName(): string {
        return 'ShowStoreOfferPacket';
    }

    /** The offer to look up on the page the redirect type chooses. */
    public offerId: UUID = new UUID();

    /** The page the client opens, as the `Redirect Type` byte. */
    public redirectType: ShowStoreOfferRedirectType = ShowStoreOfferRedirectType.MarketplaceOffer;

    /** Reads the offer uuid and the redirect type. */
    public decodePayload(): void {
        Object.assign(this, layoutAt(showStoreOfferPacket, this.codecProtocol).decode(this));
    }

    /** Writes the offer uuid and the redirect type. */
    public encodePayload(): void {
        layoutAt(showStoreOfferPacket, this.codecProtocol).encode(this, this);
    }
}
