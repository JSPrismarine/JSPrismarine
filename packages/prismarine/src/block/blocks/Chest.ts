import { BlockIdsType } from '../BlockIdsType.js';
import { BlockToolType } from '../BlockToolType.js';
import Solid from '../Solid.js';

export default class Chest extends Solid {
    public constructor() {
        super({
            name: 'minecraft:chest',
            id: BlockIdsType.Chest,
            hardness: 2.5
        });
    }

    public getToolType() {
        return [BlockToolType.None, BlockToolType.Axe];
    }

    public getFlammability() {
        return 20;
    }

    public getFuelTime() {
        return 300;
    }
}
