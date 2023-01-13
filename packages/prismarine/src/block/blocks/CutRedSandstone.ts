import RedSandstone, { RedSandstoneType } from './RedSandstone.js';

export default class RedCutSandstone extends RedSandstone {
    public constructor() {
        super('minecraft:cut_red_sandstone', RedSandstoneType.Cut);
    }
}
