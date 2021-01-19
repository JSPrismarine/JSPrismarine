import WhiteConcrete, { ConcreteColorType } from './WhiteConcrete';

export default class PinkConcrete extends WhiteConcrete {
    public constructor() {
        super('minecraft:pink_concrete', ConcreteColorType.Pink);
    }
}
