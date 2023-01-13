import WhiteConcretePowder, { ConcretePowderColorType } from './WhiteConcretePowder.js';

export default class BrownConcrete extends WhiteConcretePowder {
    public constructor() {
        super('minecraft:brown_concrete_powder', ConcretePowderColorType.Brown);
    }
}
