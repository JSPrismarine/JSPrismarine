import WhiteConcrete, { ConcreteColorType } from './WhiteConcrete';

export default class BlueConcrete extends WhiteConcrete {
    public constructor() {
        super('minecraft:blue_concrete', ConcreteColorType.Blue);
    }
}
