import Block from '../'
import { ItemTieredTool } from '../../item/ItemTieredTool';
import { BlockToolType } from '../BlockToolType';

export default class Stone extends Block {
    constructor() {
        super({
            name: 'minecraft:stone',
            id: 1,
            hardness: 1.5
        });
    }

    getToolType() {
        return BlockToolType.Pickaxe;
    }

    getToolHarvestLevel() {
        return ItemTieredTool.Wooden;
    }
};
