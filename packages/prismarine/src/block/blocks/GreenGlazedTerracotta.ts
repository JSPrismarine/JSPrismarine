import { BlockIdsType } from '../BlockIdsType';
import { BlockToolType } from '../BlockToolType';
import { Solid } from '../Solid';

export default class GreenGlazedTerracotta extends Solid {
    public constructor() {
        super({
            name: 'minecraft:green_glazed_terracotta',
            id: BlockIdsType.GreenGlazedTerracotta,
            hardness: 1.4
        });
    }

    public getToolType() {
        return [BlockToolType.Pickaxe];
    }
}
