import { BlockIdsType } from '../BlockIdsType';
import { BlockToolType } from '../BlockToolType';
import Solid from '../Solid';

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
