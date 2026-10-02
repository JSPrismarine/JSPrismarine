import StoneSlab, { SlabType } from './StoneSlab';

export default class SandSlab extends StoneSlab {
    public constructor() {
        super('minecraft:sandstone_slab', SlabType.Sand);
    }
}
