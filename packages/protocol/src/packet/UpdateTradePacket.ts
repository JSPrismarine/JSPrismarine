import NetworkPacket from '../NetworkPacket';
import { PacketIdentifier } from '../PacketIdentifier';
import { updateTradePacket } from '../wire/definitions/updateTrade';
import { layoutAt } from '../wire/WireLayout';

import type NetworkBinaryStream from '../NetworkBinaryStream';
import type { UpdateTradePayload } from '../wire/definitions/updateTrade';

/** The current offers and trading screen state of a villager. */
export type UpdateTrade = UpdateTradePayload;

/**
 * Sends a trader's offers and screen state to the client.
 *
 * Protocol 2193 layout: `Container Id` and `Type` (uint8), `Size` and `Trader Tier`
 * (ZigZag varint32), `Entity Unique Id` and `Last Trading Player` (ZigZag varint64),
 * `Display Name` (string), the two screen flags (boolean), and `Data`, the network NBT
 * compound containing the offers. The offer compound occupies the rest of the packet.
 * @see https://mojang.github.io/bedrock-protocol-docs/1.26.60/packets/update-trade-packet/
 */
export default class UpdateTradePacket extends NetworkPacket<UpdateTrade> {
    public get id(): number {
        return PacketIdentifier.UPDATE_TRADE;
    }

    protected serializePayload(stream: NetworkBinaryStream, data: UpdateTrade): void {
        layoutAt(updateTradePacket, this.codecProtocol).encode(stream, data);
    }

    protected deserializePayload(stream: NetworkBinaryStream): UpdateTrade {
        return layoutAt(updateTradePacket, this.codecProtocol).decode(stream);
    }
}
