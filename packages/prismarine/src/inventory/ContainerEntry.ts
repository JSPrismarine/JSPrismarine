// import BinaryStream from '@jsprismarine/jsbinaryutils';
import type Block from '../block/Block.js';
import type Item from '../item/Item.js';
import { item_id_map } from '@jsprismarine/bedrock-data';

export default class ContainerEntry {
    private item: Item | Block;
    private count: number;

    public constructor({ item, count = 0 }: { item: Item | Block; count?: number }) {
        this.item = item;
        this.count = count;
    }

    public networkSerialize(stream: any): void {
        const itemstack = this.getItem();

        if (itemstack.getName() === 'minecraft:air') {
            stream.writeVarInt(0);
            return;
        }

        stream.writeVarInt(itemstack.getNetworkId());
        stream.writeVarInt(((itemstack.meta & 0x7fff) << 8) | this.getCount());

        if (itemstack.nbt !== null) {
            // Write the amount of tags to write
            // (1) according to vanilla
            stream.writeUnsignedShortLE(0xffff);
            stream.writeByte(1);

            // Write hardcoded NBT tag
            // TODO: unimplemented NBT.write(nbt, true, true)
        } else {
            stream.writeUnsignedShortLE(0);
        }

        // CanPlace and canBreak
        stream.writeVarInt(0);
        stream.writeVarInt(0);

        // TODO: check for additional data
        if (itemstack.getNetworkId() === item_id_map['minecraft:shield']) {
            stream.writeVarLong(BigInt(0));
        }
    }

    public getItem() {
        return this.item;
    }

    public getCount() {
        return this.count;
    }

    public setCount(count: number) {
        this.count = count;
    }
}
