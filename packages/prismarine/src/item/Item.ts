import BinaryStream from '@jsprismarine/jsbinaryutils';
import { BlockToolType } from '../block/BlockToolType';
import { ByteOrder } from '../nbt/ByteOrder';
import { ItemEnchantmentType } from './ItemEnchantmentType';
import { item_id_map as ItemIdMap } from '@jsprismarine/bedrock-data';
import NBTReader from '../nbt/NBTReader';
import PacketBinaryStream from '../network/PacketBinaryStream';

export interface ItemProps {
    id: number;
    name: string;
    meta?: number;
    nbt?: any;
    count?: number;
    durability?: number;
}

export default class Item {
    private id: number;
    private networkId: number;
    private name: string;
    public meta = 0;
    public durability: number = this.getMaxDurability();

    // TODO
    public nbt = null;
    public count = 1;

    public constructor({ id, name, meta }: ItemProps) {
        this.id = id;
        this.name = name;
        if (meta) this.meta = meta;

        this.networkId = ItemIdMap[name];
        // if (!this.networkId) console.log(name, id, this.networkId);
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
        return this.networkId ?? this.getId();
    }

    public isTool() {
        return false;
    }

    public isArmorPiece() {
        return false;
    }

    public getBurntime() {
        return 0;
    }

    public getToolType() {
        return BlockToolType.None;
    }

    public getToolHarvestLevel() {
        return 0;
    }

    public getArmorDefensePoints() {
        return 0;
    }

    public getArmorToughness() {
        return 0;
    }

    public hasEnchantment(enchantment: ItemEnchantmentType) {
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

    public networkSerialize(stream: BinaryStream): void {
        if (this.getName() === 'minecraft:air') {
            stream.writeVarInt(0);
            return;
        }

        stream.writeVarInt(this.getNetworkId());
        stream.writeVarInt(((this.meta & 0x7fff) << 8) | this.getAmount());

        if (this.nbt !== null) {
            // Write the amount of tags to write
            // (1) according to vanilla
            stream.writeLShort(0xffff);
            stream.writeByte(1);

            // Write hardcoded NBT tag
            // TODO: unimplemented NBT.write(nbt, true, true)
        } else {
            stream.writeLShort(0);
        }

        // CanPlace and canBreak
        stream.writeVarInt(0);
        stream.writeVarInt(0);

        // TODO: check for additional data
    }

    public static networkDeserialize(stream: PacketBinaryStream): Item {
        const id = stream.readVarInt();
        if (id === 0) {
            // TODO: items
            return new Item({ id: 0, name: 'minecraft:air' });
        }

        const temp = stream.readVarInt();
        const amount = temp & 0xff;
        const data = temp >> 8;

        let nbt = null;
        const extraLen = stream.readLShort();
        if (extraLen === -1) {
            const version = stream.readByte();

            try {
                const nbtReader = new NBTReader(stream, ByteOrder.LITTLE_ENDIAN);
                nbtReader.setUseVarint(true);
                nbt = nbtReader.parse();
            } catch (e) {
                throw new Error(`Failed to parse item stack nbt: ${e}`);
                // TODO: Just log and return AIR
            }
        }

        const countPlaceOn = stream.readVarInt();
        for (let i = 0; i < countPlaceOn; i++) {
            stream.readString();
        }

        const countCanBreak = stream.readVarInt();
        for (let i = 0; i < countCanBreak; i++) {
            stream.readString();
        }

        // TODO: check if has additional data

        // TODO: runtimeId
        // TODO: https://github.com/JSPrismarine/JSPrismarine/issues/106new
        return new Item({ id, name: 'minecraft:unknown', meta: data });
    }
}
