import Solid from '../Solid';
import { BlockIdsType } from '../BlockIdsType';
import { BlockToolType } from '../BlockToolType';
import { ItemTieredToolType } from '../../item/ItemTieredToolType';

export default class MobSpawner extends Solid {
    constructor() {
        super({
            name: 'minecraft:mob_spawner',
            id: BlockIdsType.MobSpawner,
            hardness: 5
        });
    }

    public getToolType() {
        return BlockToolType.Pickaxe;
    }

    public getToolHarvestLevel() {
        return ItemTieredToolType.Wood;
    }

    public getLightLevel() {
        return 3;
    }
}
