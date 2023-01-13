import { BlockIdsType } from '../BlockIdsType.js';
import Flowable from '../Flowable.js';

export default class DeadShrub extends Flowable {
    public meta = 0;

    public constructor() {
        super({
            name: 'minecraft:dead_shrub',
            id: BlockIdsType.TallGrass,
            hardness: 0
        });
    }

    public canBeReplaced() {
        return true;
    }
}
