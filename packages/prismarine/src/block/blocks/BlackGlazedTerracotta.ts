import { BlockIdsType } from '../BlockIdsType';
import { BlockToolType } from '../BlockToolType';
import { Solid } from '../Solid';

export default class BlackGlazedTerracotta extends Solid {
    public constructor() {
        super({
            name: 'minecraft:black_glazed_terracotta',
            id: BlockIdsType.BlackGlazedTerracotta,
            hardness: 1.4
        });
    }

    public getToolType() {
        return [BlockToolType.Pickaxe];
    }
}
