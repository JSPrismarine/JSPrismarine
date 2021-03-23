import { BlockIdsType } from '../BlockIdsType';
import { BlockToolType } from '../BlockToolType';
import { ItemTieredToolType } from '../../item/ItemTieredToolType';
import Solid from '../Solid';

export default class MobSpawner extends Solid {
    public constructor() {
        super({
            name: 'minecraft:mob_spawner',
            id: BlockIdsType.MobSpawner,
            hardness: 5
        });
    }

    public getToolType() {
        return [BlockToolType.Pickaxe];
    }

    public getToolHarvestLevel() {
        return ItemTieredToolType.Wood;
    }

    public getLightLevel() {
        return 3;
    }
}
