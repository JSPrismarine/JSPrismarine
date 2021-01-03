import Solid from '../Solid';
import { BlockIdsType } from '../BlockIdsType';

export default class DoubleStoneSlab extends Solid {
    constructor() {
        super({
            name: 'minecraft:double_stone_slab',
            id: BlockIdsType.DoubleStoneSlab,
            hardness: 2
        });
    }
}
