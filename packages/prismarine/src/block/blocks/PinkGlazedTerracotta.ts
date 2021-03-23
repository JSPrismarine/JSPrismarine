import { BlockIdsType } from '../BlockIdsType';
import { BlockToolType } from '../BlockToolType';
import Solid from '../Solid';

export default class PinkGlazedTerracotta extends Solid {
    public constructor() {
        super({
            name: 'minecraft:pink_glazed_terracotta',
            id: BlockIdsType.PinkGlazedTerracotta,
            hardness: 1.4
        });
    }

    public getToolType() {
        return [BlockToolType.Pickaxe];
    }
}
