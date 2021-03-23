import { BlockIdsType } from '../BlockIdsType';
import { BlockToolType } from '../BlockToolType';
import Transparent from '../Transparent';

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
