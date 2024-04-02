import { BlockIdsType } from '../BlockIdsType';
import { BlockToolType } from '../BlockToolType';
import { Solid } from '../Solid';

export default class CyanGlazedTerracotta extends Solid {
    public constructor() {
        super({
            name: 'minecraft:cyan_glazed_terracotta',
            id: BlockIdsType.CyanGlazedTerracotta,
            hardness: 1.4
        });
    }

    public getToolType() {
        return [BlockToolType.Pickaxe];
    }
}
