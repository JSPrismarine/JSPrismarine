import ConcretePowder, { ConcretePowderColor } from './WhiteConcretePowder';

export default class BrownConcrete extends ConcretePowder {
    constructor() {
        super('minecraft:brown_concrete_powder', ConcretePowderColor.Brown);
    }
}
