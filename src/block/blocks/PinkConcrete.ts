import Concrete, { ConcreteColor } from './WhiteConcrete';

export default class PinkConcrete extends Concrete {
    constructor() {
        super('minecraft:pink_concrete', ConcreteColor.pink);
    }
}
