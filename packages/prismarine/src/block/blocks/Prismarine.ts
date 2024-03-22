import { BlockIdsType } from '../BlockIdsType';
import { BlockToolType } from '../BlockToolType';
import Solid from '../Solid';

export default class Prismarine extends Solid {
    public constructor() {
        super({
            name: 'minecraft:prismarine',
            id: BlockIdsType.Prismarine,
            hardness: 1.5
        });
    }

    public getToolType() {
        return [BlockToolType.Pickaxe];
    }
}
