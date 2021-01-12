import WhiteConcretePowder, { ConcretePowderColorType } from './WhiteConcretePowder';

export default class PurpleConcrete extends WhiteConcretePowder {
    constructor() {
        super('minecraft:purple_concrete_powder', ConcretePowderColorType.Purple);
    }
}
