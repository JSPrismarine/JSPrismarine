import WhiteConcretePowder, { ConcretePowderColorType } from './WhiteConcretePowder';

export default class YellowBlueConcrete extends WhiteConcretePowder {
    constructor() {
        super('minecraft:yellow_concrete_powder', ConcretePowderColorType.Yellow);
    }
}
