import OakSapling, { SaplingType } from './OakSapling';

export default class JungleSapling extends OakSapling {
    public constructor() {
        super('minecraft:jungle_sapling', SaplingType.Jungle);
    }
}
