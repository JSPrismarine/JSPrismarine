import Sandstone, { SandstoneType } from './Sandstone';
export default class SmoothSandstone extends Sandstone {
    public constructor() {
        super('minecraft:smooth_sandstone', SandstoneType.Smooth);
    }
}
