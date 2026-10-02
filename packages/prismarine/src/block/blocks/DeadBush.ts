import { BlockIdsType } from '../BlockIdsType';
import { DropTable } from '../DropTable';
import { Flowable } from '../Flowable';

export default class DeadBush extends Flowable {
    public constructor() {
        super({
            name: 'minecraft:deadbush',
            id: BlockIdsType.DeadBush,
            hardness: 0
        });
    }

    public canBeReplaced() {
        return true;
    }

    /** Nought to two sticks, and nothing else - a dead bush is not an item. */
    public getDropTable(): DropTable {
        return new DropTable([{ name: 'minecraft:stick', min: 0, max: 2 }]);
    }
}
