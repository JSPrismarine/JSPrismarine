import { ByteOrder, NBTReader } from '@jsprismarine/nbt';

import { item_id_map as ItemIdMap } from '@jsprismarine/bedrock-data';
import BinaryStream from '@jsprismarine/jsbinaryutils';
import { BlockMappings } from '../block/BlockMappings';
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

    public constructor({ id, name, meta }: ItemProps) {
        this.id = id;
        this.name = name;
        if (meta) this.meta = meta;

        this.networkId = ItemIdMap[name] as number;
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

    public networkSerialize(
        stream: BinaryStream,
        additionalData: null | ((stream: BinaryStream) => void) = null
    ): void {
        stream.writeVarInt(this.getNetworkId());
        if (this.getId() === 0 || this.getName() === 'minecraft:air') {
            // The item is Air so there's no additional data
            return;
        }

        stream.writeShortLE(this.getAmount());
        stream.writeUnsignedVarInt(this.meta);

        // Use a closure to add additional data
        if (additionalData) {
            additionalData(stream);
        }

        // TODO: Proper block runtime ID
        stream.writeVarInt(BlockMappings.getRuntimeId(this.getName()));

        const str = new BinaryStream();

        /* if (this.nbt !== null) {
            // Write the amount of tags to write
            // (1) according to vanilla
            stream.writeUnsignedShortLE(0xffff);
            stream.writeByte(1);

            // Write hardcoded NBT tag
            // TODO: unimplemented NBT.write(nbt, true, true)
        } */

        // TODO: proper NBT
        str.writeShortLE(0);

        // CanPlace and canBreak
        str.writeIntLE(0);
        str.writeIntLE(0);

        // TODO: check for additional data
        if (this.getName() === 'minecraft:shield') {
            str.writeLongLE(BigInt(0));
        }

        stream.writeUnsignedVarInt(str.getBuffer().byteLength);
        stream.write(str.getBuffer());

        // TODO: check for additional data
    }

    public static networkDeserialize(stream: BinaryStream, extra = false): Item {
        const id = stream.readVarInt();
        if (id === 0) {
            // TODO: items
            return new Item({ id: 0, name: 'minecraft:air' });
        }

        const _count = stream.readUnsignedShortLE(); // eslint-disable-line unused-imports/no-unused-vars
        const _netData = stream.readUnsignedVarInt(); // eslint-disable-line unused-imports/no-unused-vars

        // TODO: refactor everything basically...
        if (extra && stream.readBoolean()) {
            stream.readVarInt();
        }

        const temp = stream.readVarInt();
        // const amount = temp & 0xff;
        const data = temp >> 8;

        let _nbt = null;
        const extraLen = stream.readUnsignedShortLE();
        if (extraLen === -1) {
            const version = stream.readByte(); // eslint-disable-line unused-imports/no-unused-vars

            try {
                const nbtReader = new NBTReader(stream, ByteOrder.LITTLE_ENDIAN);
                nbtReader.setUseVarint(true);
                _nbt = nbtReader.parse();
            } catch (error: unknown) {
                throw new Error(`Failed to parse item stack nbt`, { cause: error });
                // TODO: Just log and return AIR
            }
        }

        const countPlaceOn = stream.readVarInt();
        for (let i = 0; i < countPlaceOn; i++) {
            stream.read(stream.readUnsignedShortLE());
        }

        const countCanBreak = stream.readVarInt();
        for (let i = 0; i < countCanBreak; i++) {
            stream.read(stream.readUnsignedShortLE());
        }

        // TODO: check if has additional data

        // TODO: runtimeId
        // TODO: https://github.com/JSPrismarine/JSPrismarine/issues/106new
        return new Item({ id, name: 'minecraft:unknown', meta: data });
    }
}
