import { BlockIdsType } from '../BlockIdsType';
import { Flowable } from '../Flowable';

export default class Dandelion extends Flowable {
    public constructor() {
        super({
            name: 'minecraft:yellow_flower', // Supposed to be "yellow_flower", but.. just no.  // TODO: to match runtimeIds is yellow_flower
            id: BlockIdsType.YellowFlower,
            hardness: 0
        });
    }

    public canBeReplaced() {
        return true;
    }
}
