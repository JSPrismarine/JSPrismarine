import WhiteConcretePowder, { ConcretePowderColorType } from './WhiteConcretePowder';

export default class BrownConcrete extends WhiteConcretePowder {
    public constructor() {
        super('minecraft:brown_concrete_powder', ConcretePowderColorType.Brown);
    }
}
