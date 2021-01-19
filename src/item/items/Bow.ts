import { ItemIdsType } from '../ItemIdsType';
import Tool from '../Tool';

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
