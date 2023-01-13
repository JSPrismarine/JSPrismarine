import WhiteConcretePowder, { ConcretePowderColorType } from './WhiteConcretePowder.js';

export default class RedConcrete extends WhiteConcretePowder {
    public constructor() {
        super('minecraft:red_concrete_powder', ConcretePowderColorType.Red);
    }
}
