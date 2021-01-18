import { ItemIdsType } from '../ItemIdsType';
import Tool from '../Tool';

export default class Trident extends Tool {
    public constructor() {
        super({
            name: 'minecraft:trident',
            id: ItemIdsType.Trident
        });
    }

    getMaxDurability() {
        return 250;
    }
}
