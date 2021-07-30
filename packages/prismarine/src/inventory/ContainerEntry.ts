import BinaryStream from '@jsprismarine/jsbinaryutils';
import type Block from '../block/Block';
import type Item from '../item/Item';
import { item_id_map } from '@jsprismarine/bedrock-data';

export default class ContainerEntry {
    private item: Item | Block;
    private count: number;

    public constructor({ item, count = 0 }: { item: Item | Block; count?: number }) {
        this.item = item;
        this.count = count;
    }

    public networkSerialize(stream: BinaryStream): void {
        let tempstream = new BinaryStream();

        const itemstack = this.getItem();

        if (itemstack.getName() === 'minecraft:air') {
            stream.writeVarInt(0);
            return;
        }

        stream.writeVarInt(itemstack.getNetworkId());
        stream.writeLShort(this.getCount());
        stream.writeUnsignedVarInt(itemstack.meta);
        stream.writeVarInt(0);

        if (itemstack.nbt !== null) {
            // Write the amount of tags to write
            // (1) according to vanilla
            tempstream.writeLShort(0xffff);
            tempstream.writeByte(1);

            // Write hardcoded NBT tag
            // TODO: unimplemented NBT.write(nbt, true, true)
        } else {
            tempstream.writeLShort(0);
        }

        // CanPlace and canBreak
        tempstream.writeVarInt(0);
        tempstream.writeVarInt(0);

        // TODO: check for additional data
        if (itemstack.getNetworkId() === item_id_map['minecraft:shield']) {
            tempstream.writeVarLong(BigInt(0));
        }
        stream.writeUnsignedVarInt(tempstream.getBuffer().length);
        stream.append(tempstream.getBuffer());
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
