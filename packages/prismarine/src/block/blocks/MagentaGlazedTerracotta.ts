import { BlockIdsType } from '../BlockIdsType';
import { BlockToolType } from '../BlockToolType';
import Solid from '../Solid';

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
