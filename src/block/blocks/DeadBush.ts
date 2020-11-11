import Solid from '../Solid';
import { BlockIdsType } from '../BlockIdsType';
import Flowable from '../Flowable';

export default class DeadShrub extends Flowable {
    meta = 0;

    constructor() {
        super({
            name: 'minecraft:dead_bush',
            id: BlockIdsType.DeadBush,
            hardness: 0
        });
    }

    public canBeReplaced() {
        return true;
    }
}
