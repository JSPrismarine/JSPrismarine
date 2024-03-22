import { BlockIdsType } from '../BlockIdsType';
import { BlockToolType } from '../BlockToolType';
import Solid from '../Solid';

export default class WhiteGlazedTerracotta extends Solid {
    public constructor() {
        super({
            name: 'minecraft:white_glazed_terracotta',
            id: BlockIdsType.WhiteGlazedTerracotta,
            hardness: 1.4
        });
    }

    public getToolType() {
        return [BlockToolType.Pickaxe];
    }
}
