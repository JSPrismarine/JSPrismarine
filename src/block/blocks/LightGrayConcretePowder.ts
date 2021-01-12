import ConcretePowder, { ConcretePowderColor } from './WhiteConcretePowder';

export default class LightGrayConcrete extends ConcretePowder {
    constructor() {
        super('minecraft:light_gray_concrete_powder', ConcretePowderColor.LightGray);
    }
}
