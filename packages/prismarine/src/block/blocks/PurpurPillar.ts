import { BlockIdsType } from '../BlockIdsType.js';
import { BlockToolType } from '../BlockToolType.js';
import Solid from '../Solid.js';

export default class PurpurPillar extends Solid {
    public constructor() {
        super({
            name: 'minecraft:purpur_pillar',
            id: BlockIdsType.PurpurBlock,
            hardness: 1.5
        });
        this.meta = 2;
    }

    public getToolType() {
        return [BlockToolType.Pickaxe];
    }
}
