import { BlockIdsType } from '../BlockIdsType.js';
import { BlockToolType } from '../BlockToolType.js';
import Solid from '../Solid.js';

export default class Prismarine extends Solid {
    public constructor() {
        super({
            name: 'minecraft:prismarine',
            id: BlockIdsType.Prismarine,
            hardness: 1.5
        });
    }

    public getToolType() {
        return [BlockToolType.Pickaxe];
    }
}
