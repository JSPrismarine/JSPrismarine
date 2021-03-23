import { BlockIdsType } from '../BlockIdsType';
import { BlockToolType } from '../BlockToolType';
import Solid from '../Solid';

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
