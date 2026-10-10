import { item_id_map as ItemIdMap } from '@jsprismarine/bedrock-data';
import BinaryStream from '@jsprismarine/binaryutils';
import { BlockRuntimeIds } from '../block/state/BlockRuntimeIds';
import { BlockToolType } from '../block/BlockToolType';
import type { ItemEnchantmentType } from './ItemEnchantmentType';

export interface ItemProps {
    id: number;
    name: string;
    meta?: number;
    nbt?: any;
    count?: number;
    durability?: number;
}

export class Item {
    private id: number;
    private networkId: number;
    private name: string;
    public meta = 0;
    public durability: number = this.getMaxDurability();

    // TODO
    public nbt = null;
    public count = 1;

    public constructor({ id, name, meta, count }: ItemProps) {
        this.id = id;
        this.name = name;
        if (meta) this.meta = meta;
        // Declared by `ItemProps` but silently dropped until now, so a stack read off the
        // wire came back as one item however many the client said it held.
        if (count) this.count = count;

        this.networkId = (ItemIdMap as any)[name] as number;
    }

    public getName(): string {
        return this.name;
    }

    public getId() {
        return this.id;
    }

    /**
     * Get the Block's network numeric id
     */
    public getNetworkId() {
        return this.networkId || this.getId();
    }

    public isTool() {
        return false;
    }

    public isArmorPiece() {
        return false;
    }

    public getBurnTime() {
        return 0;
    }

    public getToolType() {
        return BlockToolType.None;
    }

    public getToolHarvestLevel() {
        return 0;
    }

    /**
     * Half-hearts a swing with this in hand is worth.
     *
     * One for everything that is not a weapon, which is deliberate and is vanilla's rule rather
     * than a placeholder: a bare fist does one, and so does hitting somebody with a torch. Only
     * the tiered tools override it - see `TieredTool`, where the whole table lives.
     * @returns {number} The damage, before criticals and enchantments.
     */
    public getAttackDamage() {
        return 1;
    }

    public getArmorDefensePoints() {
        return 0;
    }

    public getArmorToughness() {
        return 0;
    }

    public hasEnchantment(_enchantment: ItemEnchantmentType) {
        return false;
    }

    public getEnchantability() {
        return 0;
    }

    public getMaxDurability() {
        return 0;
    }

    public getDurability() {
        return this.durability;
    }

    public getMaxAmount() {
        return 64;
    }

    public getAmount() {
        return this.count;
    }

    public isPartOfCreativeInventory() {
        return true;
    }

    /**
     * The empty stack.
     *
     * A count of zero as well as the air name, because at 2168 an empty stack still writes its
     * count - so an "empty" stack holding one of something says the slot has one air in it.
     */
    public static air(): Item {
        return new Item({ id: 0, name: 'minecraft:air', meta: 0, count: 0 });
    }

    /**
     * The id this stack goes out under.
     *
     * Air is the empty slot, and the empty slot is a bare zero - not whatever number the item
     * table has for the name. It has one: `minecraft:air` is -158 there, and writing that
     * leaves the client holding a real item in every slot the player is not using.
     */
    private wireId(): number {
        return this.getName() === 'minecraft:air' ? 0 : this.getNetworkId();
    }

    /**
     * Writes an item stack in the form that carries a stack net id - an `ItemInstance`.
     *
     * There are two forms on the wire, and at 2168 they no longer differ by one byte. This
     * one, which an inventory, an equipped hand or a transaction carries, opens with a
     * **fixed two byte id** and closes with an *unsigned* block runtime id; the other,
     * {@link networkSerializeWithoutStackId}, uses a varint for both. Neither still stops
     * early for air: up to 748 a zero id was the whole stack, and now every field is written
     * whatever the id is. An inventory is mostly empty slots, so a stack that stops after the
     * id truncates the packet almost immediately - which is exactly what the client reports
     * as a bad packet on join, before any of the interesting packets are even reached.
     * @param {BinaryStream} stream - the stream to write to.
     * @param {number | null} stackNetId - the stack's net id, when the receiver tracks one.
     * @see https://mojang.github.io/bedrock-protocol-docs/html/NetworkItemStackDescriptor.html
     */
    public networkSerialize(stream: BinaryStream, stackNetId: number | null = null): void {
        const networkId = this.wireId();

        stream.writeShortLE(networkId);
        stream.writeUnsignedShortLE(networkId === 0 ? 0 : this.getAmount());
        stream.writeUnsignedVarInt(networkId === 0 ? 0 : this.meta);

        stream.writeBoolean(stackNetId !== null);
        if (stackNetId !== null) {
            stream.writeVarInt(stackNetId);
        }

        stream.writeUnsignedVarInt(networkId === 0 ? 0 : this.blockRuntimeId());
        this.writeExtraData(stream, networkId !== 0);
    }

    /**
     * Writes an item stack in the form that carries no stack net id - an `ItemStack`.
     *
     * What the creative menu and every recipe carries, because nothing is tracking these
     * stacks. See {@link networkSerialize} for how the two forms differ beyond the flag.
     */
    public networkSerializeWithoutStackId(stream: BinaryStream): void {
        const networkId = this.wireId();

        stream.writeVarInt(networkId);
        stream.writeUnsignedShortLE(networkId === 0 ? 0 : this.getAmount());
        stream.writeUnsignedVarInt(networkId === 0 ? 0 : this.meta);
        stream.writeVarInt(networkId === 0 ? 0 : this.blockRuntimeId());

        this.writeExtraData(stream, networkId !== 0);
    }

    /**
     * The runtime id of the block this item places, or zero for anything that places none.
     *
     * TODO: blocks whose state name differs from their item name - the sixteen beds are all
     * `minecraft:bed` on the wire - resolve to zero here too. Fixing that needs the
     * BlockManager, which an Item has no way to reach.
     */
    private blockRuntimeId(): number {
        return BlockRuntimeIds.tryGetByName(this.getName()) ?? 0;
    }

    /**
     * The length prefixed blob holding the nbt and the can-place-on / can-break lists.
     *
     * An empty stack writes a bare zero length rather than an empty blob - the client reads
     * no further into a slot that holds nothing.
     * @param {BinaryStream} stream - the stream to write to.
     * @param {boolean} present - whether this stack holds anything at all.
     */
    private writeExtraData(stream: BinaryStream, present: boolean): void {
        if (!present) {
            stream.writeUnsignedVarInt(0);
            return;
        }

        const str = new BinaryStream();

        // TODO: proper NBT. A length of -1 followed by a version byte introduces one.
        str.writeShortLE(0);

        // CanPlace and canBreak
        str.writeIntLE(0);
        str.writeIntLE(0);

        // The tick a shield started blocking on, and only a shield has one.
        if (this.getName() === 'minecraft:shield') {
            str.writeLongLE(BigInt(0));
        }

        stream.writeUnsignedVarInt(str.getBuffer().byteLength);
        stream.write(new Uint8Array(str.getBuffer()));
    }

    /**
     * Reads an item stack off the wire.
     *
     * The layout is `NetworkItemStackDescriptor`, which `@jsprismarine/protocol` already
     * describes: the id, the count, the aux value, an **always present** flag saying whether
     * a stack net id follows, the block runtime id, and one length prefixed blob holding the
     * nbt and the can-place-on / can-break lists. All of it, even for air.
     *
     * That blob is stepped over rather than parsed. Nothing here uses it yet, and its length
     * is on the wire precisely so that a reader who does not care can skip it - which is also
     * why the two lists are no longer walked string by string.
     *
     * Reading the flag is what keeps every field after it aligned. It used to be read only
     * when a caller asked for `extra`, which no caller ever did, so from that byte onwards
     * the reader was one out: the lists it then walked had garbage lengths, ran off the end
     * of the buffer and threw. Every InventoryTransaction died there - which is what left a
     * survival block break with no sound, the packet never reaching its handler.
     * @see https://mojang.github.io/bedrock-protocol-docs/html/NetworkItemStackDescriptor.html
     */
    public static networkDeserialize(stream: BinaryStream): Item {
        return Item.readStack(stream, true);
    }

    /**
     * Reads the form that carries no stack net id - the creative menu's.
     *
     * The counterpart to {@link networkSerializeWithoutStackId}; see it for why the two
     * forms exist and what confusing them costs.
     */
    public static networkDeserializeWithoutStackId(stream: BinaryStream): Item {
        return Item.readStack(stream, false);
    }

    private static readStack(stream: BinaryStream, hasStackIdFlag: boolean): Item {
        // Two bytes in the tracked form, a varint in the other. This is the one asymmetry
        // between them that is not the flag, and it is the reason they no longer share a
        // reader beyond this line.
        const id = hasStackIdFlag ? stream.readShortLE() : stream.readVarInt();

        const count = stream.readUnsignedShortLE();
        const meta = stream.readUnsignedVarInt();

        if (hasStackIdFlag && stream.readBoolean()) {
            stream.readVarInt(); // Stack net id, only present when the flag above says so.
        }

        // Block runtime id, for the block this item places. Unsigned in the tracked form.
        if (hasStackIdFlag) stream.readUnsignedVarInt();
        else stream.readVarInt();

        stream.read(stream.readUnsignedVarInt()); // nbt, can place on, can break.

        // Read to the end whatever the id, because an empty stack is no longer a bare zero -
        // it is a full stack of zeroes, and stopping at the id leaves the rest of it to be
        // read as the next field.
        if (id === 0) return new Item({ id: 0, name: 'minecraft:air' });

        // TODO: resolve the id to a registered item rather than handing back an unknown one.
        // TODO: https://github.com/JSPrismarine/JSPrismarine/issues/106new
        return new Item({ id, name: 'minecraft:unknown', meta, count });
    }
}
