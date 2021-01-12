import ConcretePowder, { ConcretePowderColor } from './WhiteConcretePowder';

export default class RedConcrete extends ConcretePowder {
    constructor() {
        super('minecraft:red_concrete_powder', ConcretePowderColor.Red);
    }
}
