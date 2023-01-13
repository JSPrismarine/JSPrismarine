import { BlockIdsType } from '../BlockIdsType.js';
import { BlockToolType } from '../BlockToolType.js';
import Solid from '../Solid.js';

export default class LimeGlazedTerracotta extends Solid {
    public constructor() {
        super({
            name: 'minecraft:lime_glazed_terracotta',
            id: BlockIdsType.LimeGlazedTerracotta,
            hardness: 1.4
        });
    }

    public getToolType() {
        return [BlockToolType.Pickaxe];
    }
}
