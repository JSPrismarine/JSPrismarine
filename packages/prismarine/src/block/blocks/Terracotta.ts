import { BlockIdsType } from '../BlockIdsType.js';
import { BlockToolType } from '../BlockToolType.js';
import Solid from '../Solid.js';

export default class Terracotta extends Solid {
    public constructor() {
        super({
            name: 'minecraft:terracotta',
            id: BlockIdsType.HardenedClay,
            hardness: 1.25
        });
    }

    public getToolType() {
        return [BlockToolType.Pickaxe];
    }
}
