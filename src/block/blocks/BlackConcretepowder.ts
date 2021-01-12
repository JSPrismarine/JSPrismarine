import ConcretePowder, { ConcretePowderColor } from './WhiteConcretePowder';

export default class BlackConcrete extends ConcretePowder {
    constructor() {
        super('minecraft:black_concrete_powder', ConcretePowderColor.Black);
    }
}
