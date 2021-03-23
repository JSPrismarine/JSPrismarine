import { BlockIdsType } from '../BlockIdsType';
import { BlockToolType } from '../BlockToolType';
import Solid from '../Solid';

export default class BlueGlazedTerracotta extends Solid {
    public constructor() {
        super({
            name: 'minecraft:blue_glazed_terracotta',
            id: BlockIdsType.BlueGlazedTerracotta,
            hardness: 1.4
        });
    }

    public getToolType() {
        return [BlockToolType.Pickaxe];
    }
}
