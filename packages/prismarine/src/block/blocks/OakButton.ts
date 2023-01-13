import { BlockIdsType } from '../BlockIdsType.js';
import { BlockToolType } from '../BlockToolType.js';
import Transparent from '../Transparent.js';

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
