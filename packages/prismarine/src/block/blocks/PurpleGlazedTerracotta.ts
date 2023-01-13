import { BlockIdsType } from '../BlockIdsType.js';
import { BlockToolType } from '../BlockToolType.js';
import Solid from '../Solid.js';

export default class PurpleGlazedTerracotta extends Solid {
    public constructor() {
        super({
            name: 'minecraft:purple_glazed_terracotta',
            id: BlockIdsType.PurpleGlazedTerracotta,
            hardness: 1.4
        });
    }

    public getToolType() {
        return [BlockToolType.Pickaxe];
    }
}
