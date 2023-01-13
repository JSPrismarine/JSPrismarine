import { BlockIdsType } from '../BlockIdsType.js';
import { BlockToolType } from '../BlockToolType.js';
import Solid from '../Solid.js';

export default class Clay extends Solid {
    public constructor() {
        super({
            name: 'minecraft:clay',
            id: BlockIdsType.Clay,
            hardness: 0.6
        });
    }

    public getToolType() {
        return [BlockToolType.None, BlockToolType.Shovel];
    }
}
