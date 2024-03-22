import RedSandstone, { RedSandstoneType } from './RedSandstone';

export default class RedCutSandstone extends RedSandstone {
    public constructor() {
        super('minecraft:cut_red_sandstone', RedSandstoneType.Cut);
    }
}
