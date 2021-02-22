import Sandstone, { SandstoneType } from './Sandstone';

export default class CutSandstone extends Sandstone {
    constructor() {
        super('minecraft:cut_sandstone', SandstoneType.Cut);
    }
}
