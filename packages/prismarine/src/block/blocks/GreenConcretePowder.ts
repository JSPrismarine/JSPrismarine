import WhiteConcretePowder, { ConcretePowderColorType } from './WhiteConcretePowder';

export default class GreenConcrete extends WhiteConcretePowder {
    public constructor() {
        super('minecraft:green_concrete_powder', ConcretePowderColorType.Green);
    }
}
