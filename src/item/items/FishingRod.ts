import { ItemIdsType } from '../ItemIdsType';
import Tool from '../Tool';

export default class FishingRod extends Tool {
    constructor() {
        super({
            name: 'minecraft:fishing_rod',
            id: ItemIdsType.FishingRod
        });
    }

    getBurntime() {
        return 300;
    }

    getMaxDurability() {
        return 64;
    }
}
