import { ItemIdsType } from '../ItemIdsType.js';
import Tool from '../Tool.js';

export default class Shears extends Tool {
    public constructor() {
        super({
            name: 'minecraft:shears',
            id: ItemIdsType.Shears
        });
    }

    public getMaxDurability() {
        return 238;
    }
}
