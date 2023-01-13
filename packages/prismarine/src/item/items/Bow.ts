import { ItemIdsType } from '../ItemIdsType.js';
import Tool from '../Tool.js';

export default class Bow extends Tool {
    public constructor() {
        super({
            name: 'minecraft:bow',
            id: ItemIdsType.Bow
        });
    }

    public getBurntime() {
        return 300;
    }

    public getMaxDurability() {
        return 384;
    }
}
