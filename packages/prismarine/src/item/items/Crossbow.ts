import { ItemIdsType } from '../ItemIdsType.js';
import Tool from '../Tool.js';

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
