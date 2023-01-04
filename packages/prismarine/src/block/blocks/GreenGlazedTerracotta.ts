import { BlockIdsType } from '../BlockIdsType.js';
import { BlockToolType } from '../BlockToolType.js';
import Solid from '../Solid.js';

export default class GreenGlazedTerracotta extends Solid {
    public constructor() {
        super({
            name: 'minecraft:green_glazed_terracotta',
            id: BlockIdsType.GreenGlazedTerracotta,
            hardness: 1.4
        });
    }

    public getToolType() {
        return [BlockToolType.Pickaxe];
    }
}
