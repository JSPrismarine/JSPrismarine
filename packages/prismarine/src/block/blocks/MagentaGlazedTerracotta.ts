import { BlockIdsType } from '../BlockIdsType.js';
import { BlockToolType } from '../BlockToolType.js';
import Solid from '../Solid.js';

export default class MagentaGlazedTerracotta extends Solid {
    public constructor() {
        super({
            name: 'minecraft:magenta_glazed_terracotta',
            id: BlockIdsType.MagentaGlazedTerracotta,
            hardness: 1.4
        });
    }

    public getToolType() {
        return [BlockToolType.Pickaxe];
    }
}
