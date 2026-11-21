/**
 * `ShowStoreOfferPacket`: sends the player to a marketplace offer, a dressing room offer or a
 * server's own store page.
 *
 * The payload is the offer's uuid and the redirect type byte, in the order on Mojang's packet
 * page.
 * @see https://mojang.github.io/bedrock-protocol-docs/1.26.60/packets/show-store-offer-packet/
 */
import { definePacket } from '../../../wire/define';
import * as t from '../../../wire/fieldTypes';
import { uuid } from '../structureTypes';

import type { PayloadOf } from '../../../wire/define';

/** Which page the client opens for the offer, as the `Redirect Type` byte numbers it. */
export enum ShowStoreOfferRedirectType {
    MarketplaceOffer = 0,
    DressingRoomOffer = 1,
    ThirdPartyServerPage = 2
}

/** The fields sent when a client is pointed at a store offer. */
export const showStoreOfferPacket = definePacket('ShowStoreOfferPacket', {
    /** `Offer Id`: the offer to look up, as an `mce::UUID` of two little-endian uint64 halves. */
    offerId: uuid,
    /** `Redirect Type`: the page the client opens, as one byte. */
    redirectType: t.enumOf<ShowStoreOfferRedirectType>(t.uint8)
});

/** Payload carried by `ShowStoreOfferPacket`. */
export type ShowStoreOfferPayload = PayloadOf<typeof showStoreOfferPacket>;
