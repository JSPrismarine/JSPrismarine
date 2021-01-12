import Concrete, { ConcreteColor } from './WhiteConcrete';

export default class CyanConcrete extends Concrete {
    constructor() {
        super('minecraft:cyan_concrete', ConcreteColor.Cyan);
    }
}
