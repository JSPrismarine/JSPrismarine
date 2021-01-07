import { BlockIdsType } from '../BlockIdsType';
import Solid from '../Solid';

export default class DoubleStoneSlab extends Solid {
    constructor() {
        super({
            name: 'minecraft:double_stone_slab',
            id: BlockIdsType.DoubleStoneSlab,
            hardness: 2
        });
    }
}
