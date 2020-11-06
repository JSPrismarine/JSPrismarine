import Tool from '../Tool';
import { ItemIdsType } from '../ItemIdsType';

export default class FlintSteel extends Tool {
    constructor() {
        super({
            name: 'minecraft:flint_and_steel',
            id: ItemIdsType.FlintSteel
        });
    }

    getMaxDurability() {
        return 64;
    }
}
