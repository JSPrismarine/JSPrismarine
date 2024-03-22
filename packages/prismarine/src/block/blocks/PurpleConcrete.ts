import WhiteConcrete, { ConcreteColorType } from './WhiteConcrete';

export default class PurpleConcrete extends WhiteConcrete {
    public constructor() {
        super('minecraft:purple_concrete', ConcreteColorType.Purple);
    }
}
