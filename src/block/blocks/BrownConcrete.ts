import Concrete, { ConcreteColor } from './WhiteConcrete';

export default class BrownConcrete extends Concrete {
    constructor() {
        super('minecraft:brown_concrete', ConcreteColor.Brown);
    }
}
