import { BlockIdsType } from '../BlockIdsType.js';
import { BlockToolType } from '../BlockToolType.js';
import Solid from '../Solid.js';

export default class SoulSand extends Solid {
    public constructor() {
        super({
            name: 'minecraft:soul_sand',
            id: BlockIdsType.SoulSand,
            hardness: 0.5
        });
    }

    public getToolType() {
        return [BlockToolType.None, BlockToolType.Shovel];
    }
}
