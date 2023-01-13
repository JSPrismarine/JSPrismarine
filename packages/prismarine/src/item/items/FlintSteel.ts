import { ItemIdsType } from '../ItemIdsType.js';
import Tool from '../Tool.js';

export default class FlintSteel extends Tool {
    public constructor() {
        super({
            name: 'minecraft:flint_and_steel',
            id: ItemIdsType.FlintSteel
        });
    }

    public getMaxDurability() {
        return 64;
    }
}
