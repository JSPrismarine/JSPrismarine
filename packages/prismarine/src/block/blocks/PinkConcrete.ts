import WhiteConcrete, { ConcreteColorType } from './WhiteConcrete.js';

export default class PinkConcrete extends WhiteConcrete {
    public constructor() {
        super('minecraft:pink_concrete', ConcreteColorType.Pink);
    }
}
