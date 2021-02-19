import Sandstone, { SandstoneType } from './Sandstone';
export default class ChiseledSandstone extends Sandstone {
    public constructor() {
        super('minecraft:chiseled_sandstone', SandstoneType.Chiseled);
    }
}
