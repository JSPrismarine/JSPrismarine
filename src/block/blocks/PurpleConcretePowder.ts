import ConcretePowder, { ConcretePowderColor } from './WhiteConcretePowder';

export default class PurpleConcrete extends ConcretePowder {
    constructor() {
        super('minecraft:purple_concrete_powder', ConcretePowderColor.Purple);
    }
}
