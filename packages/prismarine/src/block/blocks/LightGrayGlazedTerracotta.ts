import { BlockIdsType } from '../BlockIdsType';
import { BlockToolType } from '../BlockToolType';
import { Solid } from '../Solid';

export default class LightGrayGlazedTerracotta extends Solid {
    public constructor() {
        super({
            name: 'minecraft:light_gray_glazed_terracotta',
            id: BlockIdsType.SilverGlazedTerracotta,
            hardness: 1.4
        });
    }

    public getToolType() {
        return [BlockToolType.Pickaxe];
    }
}
