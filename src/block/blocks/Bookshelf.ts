import Solid from '../Solid';
import { BlockIdsType } from '../BlockIdsType';
import { BlockToolType } from '../BlockToolType';

export default class Bookshelf extends Solid {
    constructor() {
        super({
            name: 'minecraft:bookshelf',
            id: BlockIdsType.Bookshelf,
            hardness: 1.5
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
