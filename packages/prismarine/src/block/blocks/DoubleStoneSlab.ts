import { BlockIdsType } from '../BlockIdsType.js';
import Solid from '../Solid.js';

export default class DoubleStoneSlab extends Solid {
    public constructor() {
        super({
            name: 'minecraft:double_stone_slab',
            id: BlockIdsType.DoubleStoneSlab,
            hardness: 2
        });
    }
}
