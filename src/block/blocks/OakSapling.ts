import Flowable from '../Flowable';
import {BlockIdsType} from '../BlockIdsType';

export enum SaplingType {
    Oak = 0,
    Spruce = 1,
    Birch = 2,
    Jungle = 3,
    Acacia = 4,
    DarkOak = 5
}

export default class OakSapling extends Flowable {
    constructor(
        name: string = 'minecraft:oak_sapling',
        type: SaplingType = SaplingType.Oak
    ) {
        super({
            name: name,
            id: BlockIdsType.Sapling
        });
        this.meta = type;
    }
}
