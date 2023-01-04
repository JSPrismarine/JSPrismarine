import { BlockIdsType } from '../BlockIdsType.js';
import Flowable from '../Flowable.js';

export default class DeadBush extends Flowable {
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
