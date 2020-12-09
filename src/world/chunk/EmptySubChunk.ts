import SubChunk from './SubChunk';

// Get rid of this
export default class EmptySubChunk extends SubChunk {
    constructor() {
        super();
    }

    public setBlockId(_x: number, _y: number, _z: number): boolean {
        return false;
    }

    public getHighestBlockAt(_x: number, _z: number): number {
        return 0;
    }

    public toBinary(): Buffer {
        return Buffer.alloc(6145).fill(0x00);
    }
}
