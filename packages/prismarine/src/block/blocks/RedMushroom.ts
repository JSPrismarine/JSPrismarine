import { BlockIdsType } from '../BlockIdsType';
import Flowable from '../Flowable';

export default class RedMushroom extends Flowable {
    public constructor() {
        super({
            name: 'minecraft:red_mushroom',
            id: BlockIdsType.RedMushroom,
            hardness: 0
        });
    }
}
