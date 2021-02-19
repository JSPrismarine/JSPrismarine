import WhiteConcretePowder, { ConcretePowderColorType } from './WhiteConcretePowder';

export default class CyanConcrete extends WhiteConcretePowder {
    public constructor() {
        super('minecraft:cyan_concrete_powder', ConcretePowderColorType.Cyan);
    }
}
