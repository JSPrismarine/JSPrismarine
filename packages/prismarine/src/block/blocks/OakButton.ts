import { BlockIdsType } from '../BlockIdsType';
import { BlockToolType } from '../BlockToolType';
import Transparent from '../Transparent';

export default class WoodenButton extends Transparent {
    public constructor() {
        super({
            name: 'minecraft:oak_button',
            id: BlockIdsType.WoodenButton,
            hardness: 0.5
        });
    }

    public getToolType() {
        return [BlockToolType.Axe];
    }
}
