import DataPacket from './DataPacket';

/**
 * The contents of a horse inventory, sent when a player opens one.
 *
 * Wire order at protocol 2193: `Container Id` and `Type` as one byte each, `Size` as a ZigZag
 * varint32, `Entity Unique Id` as a ZigZag varint64, then `Data`.
 *
 * `Data` is a network NBT compound holding the slots and the items each slot accepts, which
 * is how only a saddle fits the saddle slot. The docs type it as `unknown` and it runs to the
 * end of the packet, so it is carried as raw bytes. Nothing builds one yet.
 *
 * **Bound To:** Client
 * @see https://mojang.github.io/bedrock-protocol-docs/1.26.51/packets/update-equip-packet/
 */
export default class UpdateEquipPacket extends DataPacket {
    /** The id of the opened window. */
    public containerId = 0;

    /** The window's type, a horse inventory in every known case. */
    public type = 0;

    /** How many slots the window shows. */
    public size = 0;

    /** The actor whose equipment this is, usually the horse. */
    public entityUniqueId = 0n;

    /** The slots and their allowed items as a network NBT compound. */
    public data: Buffer = Buffer.alloc(0);

    /** Reads the window fields, the actor, and the rest of the packet as the inventory NBT. */
    public decodePayload(): void {
        this.containerId = this.readByte();
        this.type = this.readByte();
        this.size = this.readVarInt();
        this.entityUniqueId = this.readVarLong();
        this.data = this.readRemaining();
    }

    /** Writes the window fields, the actor, and the inventory NBT. */
    public encodePayload(): void {
        this.writeByte(this.containerId);
        this.writeByte(this.type);
        this.writeVarInt(this.size);
        this.writeVarLong(this.entityUniqueId);
        this.write(this.data);
    }
}
