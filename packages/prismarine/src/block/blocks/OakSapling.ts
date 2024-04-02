import { BlockIdsType } from '../BlockIdsType';
import { Flowable } from '../Flowable';

export enum SaplingType {
    Oak = 0,
    Spruce = 1,
    Birch = 2,
    Jungle = 3,
    Acacia = 4,
    DarkOak = 5
}

export default class OakSapling extends Flowable {
    public constructor(name = 'minecraft:oak_sapling', type: SaplingType = SaplingType.Oak) {
        super({
            name,
            id: BlockIdsType.Sapling
        });
        this.meta = type;
    }
}
