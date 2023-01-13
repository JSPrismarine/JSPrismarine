import { BlockIdsType } from '../BlockIdsType.js';
import Flowable from '../Flowable.js';

export default class RedMushroom extends Flowable {
    public constructor() {
        super({
            name: 'minecraft:red_mushroom',
            id: BlockIdsType.RedMushroom,
            hardness: 0
        });
    }
}
