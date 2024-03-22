import { BlockIdsType } from '../BlockIdsType';
import { BlockToolType } from '../BlockToolType';
import Solid from '../Solid';

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
