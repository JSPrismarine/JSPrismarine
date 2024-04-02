import { BlockIdsType } from '../BlockIdsType';
import { BlockToolType } from '../BlockToolType';
import { Solid } from '../Solid';

export default class GrayGlazedTerracotta extends Solid {
    public constructor() {
        super({
            name: 'minecraft:gray_glazed_terracotta',
            id: BlockIdsType.GrayGlazedTerracotta,
            hardness: 1.4
        });
    }

    public getToolType() {
        return [BlockToolType.Pickaxe];
    }
}
