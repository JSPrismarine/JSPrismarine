import ConcretePowder, { ConcretePowderColor } from './WhiteConcretePowder';

export default class CyanConcrete extends ConcretePowder {
    constructor() {
        super('minecraft:cyan_concrete_powder', ConcretePowderColor.Cyan);
    }
}
