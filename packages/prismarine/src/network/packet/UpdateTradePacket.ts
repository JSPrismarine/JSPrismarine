import { NetworkUtil } from '../NetworkUtil';
import DataPacket from './DataPacket';

/**
 * The offers a villager has, sent when a player opens the trading screen.
 *
 * Wire order at protocol 2193: `Container Id` and `Type` as one byte each, `Size` and
 * `Trader Tier` as ZigZag varint32, `Entity Unique Id` and `Last Trading Player` as ZigZag
 * varint64, `Display Name` as a string, `Use New Trade Screen` and `Using Economy Trade` as
 * one byte each, then `Data`.
 *
 * `Data` is a network NBT compound holding the offers themselves. The docs type it as
 * `unknown` and it runs to the end of the packet, so it is carried as raw bytes. This server
 * has no trading to describe, so nothing builds one yet.
 *
 * **Bound To:** Client
 * @see https://mojang.github.io/bedrock-protocol-docs/1.26.51/packets/update-trade-packet/
 */
export default class UpdateTradePacket extends DataPacket {
    /** The id of the open trading window. */
    public containerId = 0;

    /** The window's type. Vanilla always sends 15, the trading window. */
    public type = 0;

    /** How many offers the villager has. */
    public size = 0;

    /** The villager's level. Two more offers unlock with each tier. */
    public traderTier = 0;

    /** The villager being traded with. */
    public entityUniqueId = 0n;

    /** The player the offers were last updated for. */
    public lastTradingPlayer = 0n;

    /** The name at the top of the screen, usually the villager's profession. */
    public displayName = '';

    public useNewTradeScreen = false;

    /** False when the offers come from the old trade component. */
    public usingEconomyTrade = false;

    /** The offers as a network NBT compound. */
    public data: Buffer = Buffer.alloc(0);

    /** Reads the window fields, the villager, and the rest of the packet as the offer NBT. */
    public decodePayload(): void {
        this.containerId = this.readByte();
        this.type = this.readByte();
        this.size = this.readVarInt();
        this.traderTier = this.readVarInt();
        this.entityUniqueId = this.readVarLong();
        this.lastTradingPlayer = this.readVarLong();
        this.displayName = NetworkUtil.readString(this);
        this.useNewTradeScreen = this.readBoolean();
        this.usingEconomyTrade = this.readBoolean();
        this.data = this.readRemaining();
    }

    /** Writes the window fields, the villager, and the offer NBT. */
    public encodePayload(): void {
        this.writeByte(this.containerId);
        this.writeByte(this.type);
        this.writeVarInt(this.size);
        this.writeVarInt(this.traderTier);
        this.writeVarLong(this.entityUniqueId);
        this.writeVarLong(this.lastTradingPlayer);
        NetworkUtil.writeString(this, this.displayName);
        this.writeBoolean(this.useNewTradeScreen);
        this.writeBoolean(this.usingEconomyTrade);
        this.write(this.data);
    }
}
