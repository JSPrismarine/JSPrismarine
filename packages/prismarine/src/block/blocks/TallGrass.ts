import { BlockIdsType } from '../BlockIdsType';
import { DropTable } from '../DropTable';
import { Flowable } from '../Flowable';

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

    /**
     * Wheat seeds, one time in eight. Nothing the other seven.
     *
     * The grass itself is only yielded to shears, which is what `getSilkTouchDrops` is for
     * elsewhere; broken by hand or by anything else, this is all there is.
     */
    public getDropTable(): DropTable {
        return new DropTable([{ name: 'minecraft:wheat_seeds', oneIn: 8 }]);
    }
}
