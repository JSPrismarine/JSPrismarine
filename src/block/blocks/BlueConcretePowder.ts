import ConcretePowder, { ConcretePowderColor } from './WhiteConcretePowder';

export default class BlueConcrete extends ConcretePowder {
    constructor() {
        super('minecraft:blue_concrete_powder', ConcretePowderColor.Blue);
    }
}
