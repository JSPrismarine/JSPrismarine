import ConcretePowder, { ConcretePowderColor } from './WhiteConcretePowder';

export default class YellowBlueConcrete extends ConcretePowder {
    constructor() {
        super('minecraft:yellow_concrete_powder', ConcretePowderColor.Yellow);
    }
}
