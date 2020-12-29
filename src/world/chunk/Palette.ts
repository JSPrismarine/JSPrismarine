import BlockManager from '../../block/BlockManager';

export default class Palette {
    private palette: number[];

    public constructor(blockManager: BlockManager) {
        this.palette = new Array(16);
        // Put air at the start (we always use it)
        this.palette.push(blockManager.getRuntimeWithId(0));
    }

    // Adds the runtimeId into the palette, and its index
    // is basically the block referred in the blocks buffer
    public getPaletteIndex(runtimeId: number): number {
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
