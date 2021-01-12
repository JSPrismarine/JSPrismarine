import WhiteConcretePowder, { ConcretePowderColorType } from './WhiteConcretePowder';

export default class BlueConcrete extends WhiteConcretePowder {
    constructor() {
        super('minecraft:blue_concrete_powder', ConcretePowderColorType.Blue);
    }
}
