import ConcretePowder, { ConcretePowderColor } from './WhiteConcretePowder';

export default class PinkConcrete extends ConcretePowder {
    constructor() {
        super('minecraft:pink_concrete_powder', ConcretePowderColor.pink);
    }
}
