import WhiteConcrete, { ConcreteColorType } from './WhiteConcrete';

export default class OrangeConcrete extends WhiteConcrete {
    public constructor() {
        super('minecraft:orange_concrete', ConcreteColorType.Orange);
    }
}
