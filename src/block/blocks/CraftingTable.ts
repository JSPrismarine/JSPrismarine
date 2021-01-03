import Solid from '../Solid';
import { BlockIdsType } from '../BlockIdsType';
import { BlockToolType } from '../BlockToolType';

export default class CraftingTable extends Solid {
    constructor() {
        super({
            name: 'minecraft:crafting_table',
            id: BlockIdsType.CraftingTable,
            hardness: 2.5
        });
    }

    public getToolType() {
        return BlockToolType.Axe;
    }

    public getFlammability() {
        return 20;
    }

    public getFuelTime() {
        return 300;
    }
}
