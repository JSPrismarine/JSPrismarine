import WhiteConcrete, { ConcreteColorType } from './WhiteConcrete';

export default class LimeConcrete extends WhiteConcrete {
    public constructor() {
        super('minecraft:lime_concrete', ConcreteColorType.Lime);
    }
}
