import { ItemIdsType } from '../ItemIdsType';
import Tool from '../Tool';

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
