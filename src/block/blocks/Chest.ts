import Solid from '../Solid';
import { BlockIdsType } from '../BlockIdsType';
import { BlockToolType } from '../BlockToolType';

export default class Chest extends Solid {
    constructor() {
        super({
            name: 'minecraft:chest',
            id: BlockIdsType.Chest,
            hardness: 2.5
        });
    }

    public getToolType() {
        return BlockToolType.Axe;
    }

    public getFlammability() {
        return 20;
    }

    public getFuelTime() {
        return 300;
    }
}
