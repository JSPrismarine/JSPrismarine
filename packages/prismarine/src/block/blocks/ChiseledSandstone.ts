import Sandstone, { SandstoneType } from './Sandstone.js';
export default class ChiseledSandstone extends Sandstone {
    public constructor() {
        super('minecraft:chiseled_sandstone', SandstoneType.Chiseled);
    }
}
