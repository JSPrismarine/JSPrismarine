import { BlockIdsType } from '../BlockIdsType';
import { BlockToolType } from '../BlockToolType';
import Transparent from '../Transparent';

export default class WoodenButton extends Transparent {
    constructor() {
        super({
            name: 'minecraft:wooden_button',
            id: BlockIdsType.WoodenButton,
            hardness: 0.5
        });
    }

    getToolType() {
        return BlockToolType.Axe;
    }
}
