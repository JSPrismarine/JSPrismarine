import { ItemIdsType } from '../ItemIdsType';
import Tool from '../Tool';

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
