import OakSapling, { SaplingType } from './OakSapling';

export default class AcaciaSapling extends OakSapling {
    public constructor() {
        super('minecraft:acacia_sapling', SaplingType.Acacia);
    }
}
