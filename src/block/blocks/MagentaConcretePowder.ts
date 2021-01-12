import ConcretePowder, { ConcretePowderColor } from './WhiteConcretePowder';

export default class MagentaConcrete extends ConcretePowder {
    constructor() {
        super('minecraft:magenta_concrete_powder', ConcretePowderColor.Magenta);
    }
}
