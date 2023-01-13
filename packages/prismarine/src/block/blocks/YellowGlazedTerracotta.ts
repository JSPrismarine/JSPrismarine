import { BlockIdsType } from '../BlockIdsType.js';
import { BlockToolType } from '../BlockToolType.js';
import Solid from '../Solid.js';

export default class YellowGlazedTerracotta extends Solid {
    public constructor() {
        super({
            name: 'minecraft:yellow_glazed_terracotta',
            id: BlockIdsType.YellowGlazedTerracotta,
            hardness: 1.4
        });
    }

    public getToolType() {
        return [BlockToolType.Pickaxe];
    }
}
