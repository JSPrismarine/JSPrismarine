import { BlockIdsType } from '../BlockIdsType.js';
import { BlockToolType } from '../BlockToolType.js';
import Solid from '../Solid.js';

export default class WhiteGlazedTerracotta extends Solid {
    public constructor() {
        super({
            name: 'minecraft:white_glazed_terracotta',
            id: BlockIdsType.WhiteGlazedTerracotta,
            hardness: 1.4
        });
    }

    public getToolType() {
        return [BlockToolType.Pickaxe];
    }
}
