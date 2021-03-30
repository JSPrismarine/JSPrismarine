import BinaryStream from '@jsprismarine/jsbinaryutils';
import type Block from '../block/Block';
import type Item from '../item/Item';

export default class ContainerEntry {
    private item: Item | Block;
    private count: number;

    public constructor({ item, count = 0 }: { item: Item | Block; count?: number }) {
        this.item = item;
        this.count = count;
    }

    public networkSerialize(stream: BinaryStream): void {
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
