import WhiteConcrete, { ConcreteColorType } from './WhiteConcrete';

export default class CyanConcrete extends WhiteConcrete {
    constructor() {
        super('minecraft:cyan_concrete', ConcreteColorType.Cyan);
    }
}
