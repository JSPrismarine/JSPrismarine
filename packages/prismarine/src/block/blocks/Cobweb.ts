import { BlockIdsType } from '../BlockIdsType.js';
import { BlockToolType } from '../BlockToolType.js';
import Flowable from '../Flowable.js';

export default class Cobweb extends Flowable {
    public constructor() {
        super({
            name: 'minecraft:cobweb',
            id: BlockIdsType.Cobweb,
            hardness: 4
        });
    }

    public getToolType() {
        return [BlockToolType.Sword, BlockToolType.Shears];
    }
}
