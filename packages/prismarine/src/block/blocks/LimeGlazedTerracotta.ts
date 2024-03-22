import { BlockIdsType } from '../BlockIdsType';
import { BlockToolType } from '../BlockToolType';
import Solid from '../Solid';

export default class LimeGlazedTerracotta extends Solid {
    public constructor() {
        super({
            name: 'minecraft:lime_glazed_terracotta',
            id: BlockIdsType.LimeGlazedTerracotta,
            hardness: 1.4
        });
    }

    public getToolType() {
        return [BlockToolType.Pickaxe];
    }
}
