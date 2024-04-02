import { BlockIdsType } from '../BlockIdsType';
import { BlockToolType } from '../BlockToolType';
import { Solid } from '../Solid';

export default class YellowGlazedTerracotta extends Solid {
    public constructor() {
        super({
            name: 'minecraft:yellow_glazed_terracotta',
            id: BlockIdsType.YellowGlazedTerracotta,
            hardness: 1.4
        });
    }

    public getToolType() {
        return [BlockToolType.Pickaxe];
    }
}
