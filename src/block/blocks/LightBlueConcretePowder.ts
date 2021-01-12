import ConcretePowder, { ConcretePowderColor } from './WhiteConcretePowder';

export default class lightBlueConcrete extends ConcretePowder {
    constructor() {
        super('minecraft:light_blue_concrete_powder', ConcretePowderColor.lightBlue);
    }
}
