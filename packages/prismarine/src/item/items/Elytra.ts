import Armor from '../Armor.js';
import { ItemIdsType } from '../ItemIdsType.js';

export default class Elytra extends Armor {
    public constructor() {
        super({
            name: 'minecraft:diamond_chestplate',
            id: ItemIdsType.Elytra
        });
    }

    public getMaxDurability() {
        return 432;
    }
}
