import WhiteConcretePowder, { ConcretePowderColorType } from './WhiteConcretePowder';

export default class BlackConcrete extends WhiteConcretePowder {
    public constructor() {
        super('minecraft:black_concrete_powder', ConcretePowderColorType.Black);
    }
}
