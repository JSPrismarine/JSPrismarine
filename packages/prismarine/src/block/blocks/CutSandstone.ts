import Sandstone, { SandstoneType } from './Sandstone.js';

export default class CutSandstone extends Sandstone {
    public constructor() {
        super('minecraft:cut_sandstone', SandstoneType.Cut);
    }
}
