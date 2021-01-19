import { BlockIdsType } from '../BlockIdsType';
import { BlockToolType } from '../BlockToolType';
import Flowable from '../Flowable';

export default class Cobweb extends Flowable {
    public constructor() {
        super({
            name: 'minecraft:web', // Called cobweb in the Java Edition
            id: BlockIdsType.Cobweb,
            hardness: 4
        });
    }

    public getToolType() {
        // FIXME: add sword
        return BlockToolType.Shears;
    }
}
