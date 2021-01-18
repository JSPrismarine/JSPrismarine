import { BlockIdsType } from '../BlockIdsType';
import Flowable from '../Flowable';

export default class Dandelion extends Flowable {
    public constructor() {
        super({
            name: 'minecraft:dandelion', // Supposed to be "yellow_flower", but.. just no.
            id: BlockIdsType.YellowFlower,
            hardness: 0
        });
    }

    public canBeReplaced() {
        return true;
    }
}
