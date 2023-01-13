import { BlockIdsType } from '../BlockIdsType.js';
import { BlockToolType } from '../BlockToolType.js';
import Solid from '../Solid.js';

export default class GrayGlazedTerracotta extends Solid {
    public constructor() {
        super({
            name: 'minecraft:gray_glazed_terracotta',
            id: BlockIdsType.GrayGlazedTerracotta,
            hardness: 1.4
        });
    }

    public getToolType() {
        return [BlockToolType.Pickaxe];
    }
}
