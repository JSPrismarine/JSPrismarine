import { BlockIdsType } from '../BlockIdsType.js';
import { BlockToolType } from '../BlockToolType.js';
import Solid from '../Solid.js';

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
