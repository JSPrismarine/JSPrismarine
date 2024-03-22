import { BlockIdsType } from '../BlockIdsType';
import Solid from '../Solid';

export default class Bricks extends Solid {
    public constructor() {
        super({
            name: 'minecraft:bricks', // Supposed to be "brick_block".
            parentName: 'minecraft:brick_block',
            id: BlockIdsType.Bricks,
            hardness: 2
        });
    }

    public getBlastResistance() {
        return 6;
    }
}
