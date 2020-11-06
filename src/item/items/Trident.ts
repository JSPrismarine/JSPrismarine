import Tool from '../Tool';
import {ItemIdsType} from '../ItemIdsType';

export default class Trident extends Tool {
    constructor() {
        super({
            name: 'minecraft:trident',
            id: ItemIdsType.Trident
        });
    }

    getMaxDurability() {
        return 250;
    }
}
