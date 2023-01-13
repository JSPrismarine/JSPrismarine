import OakSapling, { SaplingType } from './OakSapling.js';

export default class BirchSapling extends OakSapling {
    public constructor() {
        super('minecraft:birch_sapling', SaplingType.Birch);
    }
}
