import { BlockIdsType } from '../BlockIdsType';
import { BlockToolType } from '../BlockToolType';
import { Solid } from '../Solid';

export default class IronTrapdoor extends Solid {
    public constructor() {
        super({
            name: 'minecraft:iron_trapdoor',
            id: BlockIdsType.IronTrapdoor,
            hardness: 3
        });
    }

    public getToolType() {
        return [BlockToolType.Pickaxe];
    }

    public isTransparent() {
        return true;
    }
}
