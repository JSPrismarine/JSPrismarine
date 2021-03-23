import { BlockIdsType } from '../BlockIdsType';
import { BlockToolType } from '../BlockToolType';
import Flowable from '../Flowable';

export default class Cobweb extends Flowable {
    public constructor() {
        super({
            name: 'minecraft:cobweb',
            id: BlockIdsType.Cobweb,
            hardness: 4
        });
    }

    public getToolType() {
        return [BlockToolType.Sword, BlockToolType.Shears];
    }
}
