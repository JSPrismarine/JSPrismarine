import BlockManager from '../../block/BlockManager';

export default class Palette {
    private palette: number[] = [];

    // Adds the runtimeId into the palette, and its index in the array
    // is basically the block referred in the blocks buffer
    public getRuntimeIndex(runtimeId: number): number {
        if (!this.palette.includes(runtimeId)) {
            this.palette.push(runtimeId);
        }
        return this.palette.indexOf(runtimeId);
    }

    public getValues(): number[] {
        return this.palette;
    }

    public size(): number {
        return this.palette.length;
    }
}
