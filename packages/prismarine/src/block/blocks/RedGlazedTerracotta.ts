import { BlockIdsType } from '../BlockIdsType';
import { BlockToolType } from '../BlockToolType';
import Solid from '../Solid';

export default class RedGlazedTerracotta extends Solid {
    public constructor() {
        super({
            name: 'minecraft:red_glazed_terracotta',
            id: BlockIdsType.RedGlazedTerracotta,
            hardness: 1.4
        });
    }

    public getToolType() {
        return [BlockToolType.Pickaxe];
    }
}
