import { BlockIdsType } from '../BlockIdsType';
import { BlockToolType } from '../BlockToolType';
import Solid from '../Solid';

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
