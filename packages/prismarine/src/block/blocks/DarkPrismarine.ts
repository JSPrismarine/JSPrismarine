import { BlockIdsType } from '../BlockIdsType.js';
import { BlockToolType } from '../BlockToolType.js';
import Solid from '../Solid.js';

export default class DarkPrismarine extends Solid {
    public constructor() {
        super({
            name: 'minecraft:dark_prismarine',
            id: BlockIdsType.Prismarine,
            hardness: 1.5
        });
        this.meta = 1;
    }

    public getToolType() {
        return [BlockToolType.Pickaxe];
    }
}
