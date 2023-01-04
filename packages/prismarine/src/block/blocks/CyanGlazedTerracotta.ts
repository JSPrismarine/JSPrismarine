import { BlockIdsType } from '../BlockIdsType.js';
import { BlockToolType } from '../BlockToolType.js';
import Solid from '../Solid.js';

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
