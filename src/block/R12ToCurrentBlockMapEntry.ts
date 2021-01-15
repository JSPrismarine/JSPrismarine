import NBTTagCompound from '../nbt/NBTTagCompound';

export default class R12ToCurrentBlockMapEntry {
    private id: string;
    private meta: number;
    private blockState: NBTTagCompound;

    public constructor(id: string, meta: number, blockState: NBTTagCompound) {
        this.id = id;
        this.meta = meta;
        this.blockState = blockState;
    }

    public getId(): string {
        return this.id;
    }

    public getMeta(): number {
        return this.meta;
    }

    public getBlockState(): NBTTagCompound {
        return this.blockState;
    }
}
