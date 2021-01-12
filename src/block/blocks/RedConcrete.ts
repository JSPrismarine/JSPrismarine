import Concrete, { ConcreteColor } from './WhiteConcrete';

export default class RedConcrete extends Concrete {
    constructor() {
        super('minecraft:red_concrete', ConcreteColor.Red);
    }
}
