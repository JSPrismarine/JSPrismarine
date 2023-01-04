import { BlockIdsType } from '../BlockIdsType.js';
import { BlockToolType } from '../BlockToolType.js';
import Transparent from '../Transparent.js';

export default class PoweredRail extends Transparent {
    public constructor() {
        super({
            name: 'minecraft:powered_rail', // Called powered_rail in the Java Edition
            id: BlockIdsType.PoweredRail,
            hardness: 0.7
        });
    }

    public getToolType() {
        return [BlockToolType.Pickaxe];
    }
}
