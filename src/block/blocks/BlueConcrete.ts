import Concrete, { ConcreteColor } from './WhiteConcrete';

export default class BlueConcrete extends Concrete {
    constructor() {
        super('minecraft:blue_concrete', ConcreteColor.Blue);
    }
}
