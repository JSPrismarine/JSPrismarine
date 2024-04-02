import { BlockIdsType } from '../BlockIdsType';
import { BlockToolType } from '../BlockToolType';
import { Solid } from '../Solid';

export default class Ice extends Solid {
    public constructor() {
        super({
            name: 'minecraft:ice',
            id: BlockIdsType.Ice,
            hardness: 0.5
        });
    }

    public isTransparent() {
        return true;
    }

    public getToolType() {
        return [BlockToolType.None, BlockToolType.Pickaxe];
    }

    public isAffectedBySilkTouch() {
        return true;
    }
}
