import ConcretePowder, { ConcretePowderColor } from './WhiteConcretePowder';

export default class OrangeConcrete extends ConcretePowder {
    constructor() {
        super('minecraft:orange_concrete_powder', ConcretePowderColor.Orange);
    }
}
