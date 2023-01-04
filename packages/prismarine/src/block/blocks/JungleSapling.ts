import OakSapling, { SaplingType } from './OakSapling.js';

export default class JungleSapling extends OakSapling {
    public constructor() {
        super('minecraft:jungle_sapling', SaplingType.Jungle);
    }
}
