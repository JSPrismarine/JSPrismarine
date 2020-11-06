import Tool from '../Tool';
import {ItemIdsType} from '../ItemIdsType';

export default class Shears extends Tool {
    constructor() {
        super({
            name: 'minecraft:shears',
            id: ItemIdsType.Shears
        });
    }

    getMaxDurability() {
        return 238;
    }
}
