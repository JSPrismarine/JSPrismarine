import Sandstone, { SandstoneType } from './Sandstone';

export default class CutSandstone extends Sandstone {
    public constructor() {
        super('minecraft:cut_sandstone', SandstoneType.Cut);
    }
}
