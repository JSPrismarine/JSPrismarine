import RedSandstone, { RedSandstoneType } from './RedSandstone';

export default class RedChiseledSandstone extends RedSandstone {
    public constructor() {
        super('minecraft:red_chiseled_sandstone', RedSandstoneType.Chiseled);
    }
}
