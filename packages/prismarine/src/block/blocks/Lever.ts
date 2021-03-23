import { BlockIdsType } from '../BlockIdsType';
import { BlockToolType } from '../BlockToolType';
import Transparent from '../Transparent';

export default class Lever extends Transparent {
    public constructor() {
        super({
            name: 'minecraft:lever',
            id: BlockIdsType.Lever,
            hardness: 0.5
        });
    }

    public getToolType() {
        return [BlockToolType.Axe];
    }
}
