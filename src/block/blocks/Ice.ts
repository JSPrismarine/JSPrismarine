import { BlockIdsType } from '../BlockIdsType';
import { BlockToolType } from '../BlockToolType';
import Solid from '../Solid';

export default class Ice extends Solid {
    constructor() {
        super({
            name: 'minecraft:ice',
            id: BlockIdsType.Ice,
            hardness: 0.5
        });
    }

    isTransparent() {
        return true;
    }

    getToolType() {
        return BlockToolType.Pickaxe;
    }

    isAffectedBySilkTouch() {
        return true;
    }
}
