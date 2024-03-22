import OakSapling, { SaplingType } from './OakSapling';

export default class BirchSapling extends OakSapling {
    public constructor() {
        super('minecraft:birch_sapling', SaplingType.Birch);
    }
}
