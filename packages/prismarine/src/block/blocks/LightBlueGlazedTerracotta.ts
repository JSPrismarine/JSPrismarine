import { BlockIdsType } from '../BlockIdsType';
import { BlockToolType } from '../BlockToolType';
import { Solid } from '../Solid';

export default class LightBlueGlazedTerracotta extends Solid {
    public constructor() {
        super({
            name: 'minecraft:light_blue_glazed_terracotta',
            id: BlockIdsType.LightBlueGlazedTerracotta,
            hardness: 1.4
        });
    }

    public getToolType() {
        return [BlockToolType.Pickaxe];
    }
}
