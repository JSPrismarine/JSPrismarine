import NetworkPacket from '../NetworkPacket';
import { PacketIdentifier } from '../PacketIdentifier';

import type NetworkBinaryStream from '../NetworkBinaryStream';

/** The current offers and trading screen state of a villager. */
export interface UpdateTrade {
    /** Container Id of the trading window. */
    containerId: number;
    /** Window type; vanilla uses 15 for trading. */
    type: number;
    /** Number of offers in the trade list. */
    size: number;
    /** Trader tier shown by the screen. */
    traderTier: number;
    /** Unique id of the trader entity. */
    entityUniqueId: bigint;
    /** Unique id of the player who last traded. */
    lastTradingPlayer: bigint;
    /** Display name shown above the trade offers. */
    displayName: string;
    /** Whether to open the newer trade screen. */
    useNewTradeScreen: boolean;
    /** Whether the offers use economy trade values. */
    usingEconomyTrade: boolean;
    /** Network NBT compound containing the offers. */
    data: Buffer;
}

/**
 * Sends a trader's offers and screen state to the client.
 *
 * Protocol 2193 layout: `Container Id` and `Type` (uint8), `Size` and `Trader Tier`
 * (ZigZag varint32), `Entity Unique Id` and `Last Trading Player` (ZigZag varint64),
 * `Display Name` (string), the two screen flags (boolean), and `Data`, the network NBT
 * compound containing the offers. The offer compound occupies the rest of the packet.
 * @see https://mojang.github.io/bedrock-protocol-docs/1.26.51/packets/update-trade-packet/
 */
export default class UpdateTradePacket extends NetworkPacket<UpdateTrade> {
    public get id(): number {
        return PacketIdentifier.UPDATE_TRADE;
    }

    protected serializePayload(stream: NetworkBinaryStream, data: UpdateTrade): void {
        stream.writeByte(data.containerId);
        stream.writeByte(data.type);
        stream.writeVarInt(data.size);
        stream.writeVarInt(data.traderTier);
        stream.writeVarLong(data.entityUniqueId);
        stream.writeVarLong(data.lastTradingPlayer);
        stream.writeString(data.displayName);
        stream.writeBoolean(data.useNewTradeScreen);
        stream.writeBoolean(data.usingEconomyTrade);
        stream.write(data.data);
    }

    protected deserializePayload(stream: NetworkBinaryStream): UpdateTrade {
        return {
            containerId: stream.readByte(),
            type: stream.readByte(),
            size: stream.readVarInt(),
            traderTier: stream.readVarInt(),
            entityUniqueId: stream.readVarLong(),
            lastTradingPlayer: stream.readVarLong(),
            displayName: stream.readString(),
            useNewTradeScreen: stream.readBoolean(),
            usingEconomyTrade: stream.readBoolean(),
            data: stream.readRemaining()
        };
    }
}
