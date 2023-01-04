import { BlockIdsType } from '../BlockIdsType.js';
import { BlockToolType } from '../BlockToolType.js';
import Transparent from '../Transparent.js';

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
