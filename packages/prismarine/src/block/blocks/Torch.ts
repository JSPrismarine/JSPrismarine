import { BlockIdsType } from '../BlockIdsType';
import { Flowable } from '../Flowable';

export default class Torch extends Flowable {
    public constructor() {
        super({
            name: 'minecraft:torch',
            id: BlockIdsType.Torch,
            hardness: 0
        });
    }

    public getLightLevel(): number {
        return 15;
    }
}
