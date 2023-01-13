import { BlockIdsType } from '../BlockIdsType.js';
import { BlockToolType } from '../BlockToolType.js';
import Solid from '../Solid.js';

export default class LightBlueGlazedTerracotta extends Solid {
    public constructor() {
        super({
            name: 'minecraft:light_blue_glazed_terracotta',
            id: BlockIdsType.LightBlueGlazedTerracotta,
            hardness: 1.4
        });
    }

    public getToolType() {
        return [BlockToolType.Pickaxe];
    }
}
