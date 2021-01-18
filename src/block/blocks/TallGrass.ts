import { BlockIdsType } from '../BlockIdsType';
import Flowable from '../Flowable';

export default class TallGrass extends Flowable {
    public meta = 1;

    public constructor() {
        super({
            name: 'minecraft:tall_grass',
            id: BlockIdsType.TallGrass,
            hardness: 0
        });
    }

    public canBeReplaced() {
        return true;
    }
}
