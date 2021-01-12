import ConcretePowder, { ConcretePowderColor } from './WhiteConcretePowder';

export default class GrayConcrete extends ConcretePowder {
    constructor() {
        super('minecraft:gray_concrete_powder', ConcretePowderColor.Gray);
    }
}
