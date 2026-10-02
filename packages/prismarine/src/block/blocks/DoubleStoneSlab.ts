import { BlockIdsType } from '../BlockIdsType';
import { Solid } from '../Solid';

export default class DoubleStoneSlab extends Solid {
    public constructor() {
        super({
            name: 'minecraft:smooth_stone_double_slab',
            id: BlockIdsType.DoubleStoneSlab,
            hardness: 2
        });
    }
}
