import { ItemIdsType } from '../ItemIdsType';
import Tool from '../Tool';

export default class Crossbow extends Tool {
    constructor() {
        super({
            name: 'minecraft:crossbow',
            id: ItemIdsType.Crossbow
        });
    }

    getBurntime() {
        return 200;
    }

    getMaxDurability() {
        return 326;
    }
}
