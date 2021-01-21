import WhiteConcretePowder, { ConcretePowderColorType } from './WhiteConcretePowder';

export default class GrayConcrete extends WhiteConcretePowder {
    public constructor() {
        super('minecraft:gray_concrete_powder', ConcretePowderColorType.Gray);
    }
}
