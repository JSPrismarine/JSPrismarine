import OakSapling, { SaplingType } from './OakSapling.js';

export default class AcaciaSapling extends OakSapling {
    public constructor() {
        super('minecraft:acacia_sapling', SaplingType.Acacia);
    }
}
