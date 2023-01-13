import { BlockIdsType } from '../BlockIdsType.js';
import { BlockToolType } from '../BlockToolType.js';
import Solid from '../Solid.js';

export default class RedGlazedTerracotta extends Solid {
    public constructor() {
        super({
            name: 'minecraft:red_glazed_terracotta',
            id: BlockIdsType.RedGlazedTerracotta,
            hardness: 1.4
        });
    }

    public getToolType() {
        return [BlockToolType.Pickaxe];
    }
}
