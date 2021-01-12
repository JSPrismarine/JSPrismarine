import Concrete, { ConcreteColor } from './WhiteConcrete';

export default class OrangeConcrete extends Concrete {
    constructor() {
        super('minecraft:orange_concrete', ConcreteColor.Orange);
    }
}
