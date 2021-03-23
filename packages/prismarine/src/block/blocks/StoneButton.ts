import { BlockIdsType } from '../BlockIdsType';
import { BlockToolType } from '../BlockToolType';
import Transparent from '../Transparent';

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
