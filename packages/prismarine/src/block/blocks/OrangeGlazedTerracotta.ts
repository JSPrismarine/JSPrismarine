import { BlockIdsType } from '../BlockIdsType.js';
import { BlockToolType } from '../BlockToolType.js';
import Solid from '../Solid.js';

export default class OrangeGlazedTerracotta extends Solid {
    public constructor() {
        super({
            name: 'minecraft:orange_glazed_terracotta',
            id: BlockIdsType.OrangeGlazedTerracotta,
            hardness: 1.4
        });
    }

    public getToolType() {
        return [BlockToolType.Pickaxe];
    }
}
