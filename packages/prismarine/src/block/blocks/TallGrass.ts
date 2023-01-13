import { BlockIdsType } from '../BlockIdsType.js';
import Flowable from '../Flowable.js';

export default class TallGrass extends Flowable {
    public meta = 1;

    public constructor() {
        super({
            name: 'minecraft:double_plant',
            id: BlockIdsType.TallGrass,
            hardness: 0
        });
    }

    public canBeReplaced() {
        return true;
    }
}
