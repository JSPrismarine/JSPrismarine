import OakSapling, { SaplingType } from './OakSapling';

export default class SpruceSapling extends OakSapling {
    constructor() {
        super('minecraft:spruce_sapling', SaplingType.Spruce);
    }
};
