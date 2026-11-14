/**
 * `UpdateTradePacket`: a trader's offers and trading screen state.
 *
 * Protocol 2193 layout: `Container Id` and `Type` (uint8), `Size` and `Trader Tier` (ZigZag
 * varint32), `Entity Unique Id` and `Last Trading Player` (ZigZag varint64), `Display Name`
 * (string), the two screen flags (boolean), and `Data`, the network NBT compound containing the
 * offers. The offer compound occupies the rest of the packet.
 * @see https://mojang.github.io/bedrock-protocol-docs/1.26.60/packets/update-trade-packet/
 */
import { definePacket } from '../define';
import * as t from '../fieldTypes';

import type { PayloadOf } from '../define';

/**
 * `Data`: the offers as a network NBT compound, carried as raw bytes to the end of the packet.
 * Callers build the compound; the packet does not parse it.
 */
const offersTail = t.custom<Buffer>(
    'OffersTail',
    (s, v) => s.write(v),
    (s) => s.readRemaining()
);

/** The `UpdateTradePacket` field list: the offers and screen state of one villager trade. */
export const updateTradePacket = definePacket('UpdateTradePacket', {
    /** `Container Id`: the id of the trading window. */
    containerId: t.uint8,
    /** `Type`: the window type; vanilla uses 15 for trading. */
    type: t.uint8,
    /** `Size`: the number of offers in the trade list. */
    size: t.varint32,
    /** `Trader Tier`: the trader tier shown by the screen. */
    traderTier: t.varint32,
    /** `Entity Unique Id`: the unique id of the trader entity. */
    entityUniqueId: t.varint64,
    /** `Last Trading Player`: the unique id of the player who last traded. */
    lastTradingPlayer: t.varint64,
    /** `Display Name`: the name shown above the trade offers. */
    displayName: t.string,
    /** `Use New Trade Screen`: whether to open the newer trade screen. */
    useNewTradeScreen: t.bool,
    /** `Using Economy Trade`: whether the offers use economy trade values. */
    usingEconomyTrade: t.bool,
    /** `Data`: the network NBT compound containing the offers; see {@link offersTail}. */
    data: offersTail
});

/** Payload carried by `UpdateTradePacket`. */
export type UpdateTradePayload = PayloadOf<typeof updateTradePacket>;
