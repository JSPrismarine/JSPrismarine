import WhiteConcretePowder, { ConcretePowderColorType } from './WhiteConcretePowder.js';

export default class BlackConcrete extends WhiteConcretePowder {
    public constructor() {
        super('minecraft:black_concrete_powder', ConcretePowderColorType.Black);
    }
}
