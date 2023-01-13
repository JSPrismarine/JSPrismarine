import { BlockIdsType } from '../BlockIdsType.js';
import { BlockToolType } from '../BlockToolType.js';
import Transparent from '../Transparent.js';

export default class StoneButton extends Transparent {
    public constructor() {
        super({
            name: 'minecraft:stone_button',
            id: BlockIdsType.StoneButton,
            hardness: 0.5
        });
    }

    public getToolType() {
        return [BlockToolType.Pickaxe];
    }
}
