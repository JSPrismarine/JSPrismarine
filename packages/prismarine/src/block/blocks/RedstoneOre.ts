import { BlockIdsType } from '../BlockIdsType';
import { BlockToolType } from '../BlockToolType';
import { ItemTieredToolType } from '../../item/ItemTieredToolType';
import Solid from '../Solid';

export default class RedstoneOre extends Solid {
    public constructor() {
        super({
            name: 'minecraft:redstone_ore',
            id: BlockIdsType.RedstoneOre,
            hardness: 3
        });
    }

    public getToolType() {
        return [BlockToolType.Pickaxe];
    }

    public getToolHarvestLevel() {
        return ItemTieredToolType.Iron;
    }
}
