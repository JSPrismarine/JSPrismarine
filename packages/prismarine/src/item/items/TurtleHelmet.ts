import Armor from '../Armor.js';
import { ItemIdsType } from '../ItemIdsType.js';

export default class TurtleShell extends Armor {
    public constructor() {
        super({
            name: 'minecraft:turtle_shell',
            id: ItemIdsType.TurtleShell
        });
    }

    public getMaxDurability() {
        return 275;
    }

    public getArmorDefensePoints() {
        return 2;
    }
}
