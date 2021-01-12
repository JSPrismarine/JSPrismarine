import Concrete, { ConcreteColor } from './WhiteConcrete';

export default class GreenConcrete extends Concrete {
    constructor() {
        super('minecraft:green_concrete', ConcreteColor.Green);
    }
}
