import { BlockIdsType } from '../BlockIdsType';
import { BlockToolType } from '../BlockToolType';
import Solid from '../Solid';

export default class Clay extends Solid {
    constructor() {
        super({
            name: 'minecraft:clay',
            id: BlockIdsType.Clay,
            hardness: 0.6
        });
    }

    public getToolType() {
        return BlockToolType.Shovel;
    }
}
