import { BlockIdsType } from '../BlockIdsType.js';
import { BlockToolType } from '../BlockToolType.js';
import Solid from '../Solid.js';

export default class PrismarineBricks extends Solid {
    public constructor() {
        super({
            name: 'minecraft:prismarine_bricks',
            id: BlockIdsType.Prismarine,
            hardness: 1.5
        });
        this.meta = 2;
    }

    public getToolType() {
        return [BlockToolType.Pickaxe];
    }
}
