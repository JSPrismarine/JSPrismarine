import WhiteConcretePowder, { ConcretePowderColorType } from './WhiteConcretePowder';

export default class BlueConcrete extends WhiteConcretePowder {
    public constructor() {
        super('minecraft:blue_concrete_powder', ConcretePowderColorType.Blue);
    }
}
