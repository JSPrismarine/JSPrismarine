import { BlockIdsType } from '../BlockIdsType.js';
import { BlockToolType } from '../BlockToolType.js';
import { ItemTieredToolType } from '../../item/ItemTieredToolType.js';
import Solid from '../Solid.js';

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
