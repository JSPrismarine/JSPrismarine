import { ItemIdsType } from '../ItemIdsType.js';
import Tool from '../Tool.js';

export default class Trident extends Tool {
    public constructor() {
        super({
            name: 'minecraft:trident',
            id: ItemIdsType.Trident
        });
    }

    public getMaxDurability() {
        return 250;
    }
}
