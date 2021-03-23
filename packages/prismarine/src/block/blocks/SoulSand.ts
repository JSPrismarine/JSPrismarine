import { BlockIdsType } from '../BlockIdsType';
import { BlockToolType } from '../BlockToolType';
import Solid from '../Solid';

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
