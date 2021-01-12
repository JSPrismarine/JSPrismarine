import ConcretePowder, { ConcretePowderColor } from './WhiteConcretePowder';

export default class LimeConcrete extends ConcretePowder {
    constructor() {
        super('minecraft:lime_concrete_powder', ConcretePowderColor.Lime);
    }
}
