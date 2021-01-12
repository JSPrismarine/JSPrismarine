import ConcretePowder, { ConcretePowderColor } from './WhiteConcretePowder';

export default class GreenConcrete extends ConcretePowder {
    constructor() {
        super('minecraft:green_concrete_powder', ConcretePowderColor.Green);
    }
}
