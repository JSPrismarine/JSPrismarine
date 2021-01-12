import Concrete, { ConcreteColor } from './WhiteConcrete';

export default class PurpleConcrete extends Concrete {
    constructor() {
        super('minecraft:purple_concrete', ConcreteColor.Purple);
    }
}
