import WhiteConcrete, { ConcreteColorType } from './WhiteConcrete.js';

export default class CyanConcrete extends WhiteConcrete {
    public constructor() {
        super('minecraft:cyan_concrete', ConcreteColorType.Cyan);
    }
}
