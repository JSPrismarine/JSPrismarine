import { ItemIdsType } from '../ItemIdsType';
import Tool from '../Tool';

export default class Crossbow extends Tool {
    public constructor() {
        super({
            name: 'minecraft:crossbow',
            id: ItemIdsType.Crossbow
        });
    }

    public getBurntime() {
        return 200;
    }

    public getMaxDurability() {
        return 326;
    }
}
