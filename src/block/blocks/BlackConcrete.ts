import Concrete, { ConcreteColor } from './WhiteConcrete';

export default class BlackConcrete extends Concrete {
    constructor() {
        super('minecraft:black_concrete', ConcreteColor.Black);
    }
}
