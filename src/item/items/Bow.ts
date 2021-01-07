import { ItemIdsType } from '../ItemIdsType';
import Tool from '../Tool';

export default class Bow extends Tool {
    constructor() {
        super({
            name: 'minecraft:bow',
            id: ItemIdsType.Bow
        });
    }

    getBurntime() {
        return 300;
    }

    getMaxDurability() {
        return 384;
    }
}
