import { BlockIdsType } from '../BlockIdsType';
import { BlockToolType } from '../BlockToolType';
import Flowable from '../Flowable';

export default class Cowweb extends Flowable {
    constructor() {
        super({
            name: 'minecraft:web', // Called cowweb in the Java Edition
            id: BlockIdsType.Cowweb,
            hardness: 4
        });
    }

    getToolType() {
        // FIXME: add sword
        return BlockToolType.Shears;
    }
}
