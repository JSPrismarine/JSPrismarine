import Tool from '../Tool';
import {ItemIdsType} from '../ItemIdsType';

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
