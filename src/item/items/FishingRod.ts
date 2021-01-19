import { ItemIdsType } from '../ItemIdsType';
import Tool from '../Tool';

export default class FishingRod extends Tool {
    public constructor() {
        super({
            name: 'minecraft:fishing_rod',
            id: ItemIdsType.FishingRod
        });
    }

    public getBurntime() {
        return 300;
    }

    public getMaxDurability() {
        return 64;
    }
}
