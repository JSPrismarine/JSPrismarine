import StoneSlab, { SlabType } from './StoneSlab.js';

export default class SandSlab extends StoneSlab {
    public constructor() {
        super('minecraft:sand_slab', SlabType.Sand);
    }
}
