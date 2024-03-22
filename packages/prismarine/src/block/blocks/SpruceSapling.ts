import OakSapling, { SaplingType } from './OakSapling';

export default class SpruceSapling extends OakSapling {
    public constructor() {
        super('minecraft:spruce_sapling', SaplingType.Spruce);
    }
}
