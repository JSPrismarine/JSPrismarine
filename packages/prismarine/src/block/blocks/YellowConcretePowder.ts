import WhiteConcretePowder, { ConcretePowderColorType } from './WhiteConcretePowder.js';

export default class YellowBlueConcrete extends WhiteConcretePowder {
    public constructor() {
        super('minecraft:yellow_concrete_powder', ConcretePowderColorType.Yellow);
    }
}
