import { BlockIdsType } from '../BlockIdsType.js';
import { BlockToolType } from '../BlockToolType.js';
import Solid from '../Solid.js';

export default class IronTrapdoor extends Solid {
    public constructor() {
        super({
            name: 'minecraft:iron_trapdoor',
            id: BlockIdsType.IronTrapdoor,
            hardness: 3
        });
    }

    public getToolType() {
        return [BlockToolType.Pickaxe];
    }

    public isTransparent() {
        return true;
    }
}
