import Armor from '../Armor';
import {ItemIdsType} from '../ItemIdsType';

export default class TurtleShell extends Armor {
    constructor() {
        super({
            name: 'minecraft:turtle_shell',
            id: ItemIdsType.TurtleShell
        });
    }

    getMaxDurability() {
        return 275;
    }

    getArmorDefensePoints() {
        return 2;
    }
}
