import WhiteConcretePowder, { ConcretePowderColorType } from './WhiteConcretePowder';

export default class LimeConcrete extends WhiteConcretePowder {
    public constructor() {
        super('minecraft:lime_concrete_powder', ConcretePowderColorType.Lime);
    }
}
