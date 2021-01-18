import { BlockIdsType } from '../BlockIdsType';
import Flowable from '../Flowable';

export default class DeadBush extends Flowable {
    meta = 0;

    public constructor() {
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
