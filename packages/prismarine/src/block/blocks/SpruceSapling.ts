import OakSapling, { SaplingType } from './OakSapling.js';

export default class SpruceSapling extends OakSapling {
    public constructor() {
        super('minecraft:spruce_sapling', SaplingType.Spruce);
    }
}
