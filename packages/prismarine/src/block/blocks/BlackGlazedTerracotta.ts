import { BlockIdsType } from '../BlockIdsType.js';
import { BlockToolType } from '../BlockToolType.js';
import Solid from '../Solid.js';

export default class BlackGlazedTerracotta extends Solid {
    public constructor() {
        super({
            name: 'minecraft:black_glazed_terracotta',
            id: BlockIdsType.BlackGlazedTerracotta,
            hardness: 1.4
        });
    }

    public getToolType() {
        return [BlockToolType.Pickaxe];
    }
}
