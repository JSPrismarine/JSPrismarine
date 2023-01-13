import { BlockIdsType } from '../BlockIdsType.js';
import { BlockToolType } from '../BlockToolType.js';
import Solid from '../Solid.js';

export default class BlueGlazedTerracotta extends Solid {
    public constructor() {
        super({
            name: 'minecraft:blue_glazed_terracotta',
            id: BlockIdsType.BlueGlazedTerracotta,
            hardness: 1.4
        });
    }

    public getToolType() {
        return [BlockToolType.Pickaxe];
    }
}
