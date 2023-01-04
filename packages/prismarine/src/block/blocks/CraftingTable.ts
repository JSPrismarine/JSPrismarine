import { BlockIdsType } from '../BlockIdsType.js';
import { BlockToolType } from '../BlockToolType.js';
import Solid from '../Solid.js';

export default class CraftingTable extends Solid {
    public constructor() {
        super({
            name: 'minecraft:crafting_table',
            id: BlockIdsType.CraftingTable,
            hardness: 2.5
        });
    }

    public getToolType() {
        return [BlockToolType.Axe];
    }

    public getFlammability() {
        return 20;
    }

    public getFuelTime() {
        return 300;
    }
}
