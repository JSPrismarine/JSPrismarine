import { BlockIdsType } from '../BlockIdsType';
import Flowable from '../Flowable';

export default class BrownMushroom extends Flowable {
    public constructor() {
        super({
            name: 'minecraft:brown_mushroom',
            id: BlockIdsType.BrownMushroom,
            hardness: 0
        });
    }

    public getLightLevel(): number {
        return 1;
    }
}
