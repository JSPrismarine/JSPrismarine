import Solid from '../Solid';
import { BlockIdsType } from '../BlockIdsType';

export default class Bricks extends Solid {
    constructor() {
        super({
            name: 'minecraft:bricks', // Supposed to be "brick_block".
            id: BlockIdsType.Bricks,
            hardness: 2
        });
    }

    getBlastResistance() {
        return 6;
    }
}
