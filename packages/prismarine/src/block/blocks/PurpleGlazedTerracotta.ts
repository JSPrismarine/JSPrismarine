import { BlockIdsType } from '../BlockIdsType';
import { BlockToolType } from '../BlockToolType';
import { Solid } from '../Solid';

export default class PurpleGlazedTerracotta extends Solid {
    public constructor() {
        super({
            name: 'minecraft:purple_glazed_terracotta',
            id: BlockIdsType.PurpleGlazedTerracotta,
            hardness: 1.4
        });
    }

    public getToolType() {
        return [BlockToolType.Pickaxe];
    }
}
