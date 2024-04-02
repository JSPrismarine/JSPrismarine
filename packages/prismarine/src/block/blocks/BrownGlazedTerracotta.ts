import { BlockIdsType } from '../BlockIdsType';
import { BlockToolType } from '../BlockToolType';
import { Solid } from '../Solid';

export default class BrownGlazedTerracotta extends Solid {
    public constructor() {
        super({
            name: 'minecraft:brown_glazed_terracotta',
            id: BlockIdsType.BrownGlazedTerracotta,
            hardness: 1.4
        });
    }

    public getToolType() {
        return [BlockToolType.Pickaxe];
    }
}
