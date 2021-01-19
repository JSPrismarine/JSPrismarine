import { BlockIdsType } from '../BlockIdsType';
import Flowable from '../Flowable';

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
