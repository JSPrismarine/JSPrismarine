import WhiteConcrete, { ConcreteColorType } from './WhiteConcrete.js';

export default class RedConcrete extends WhiteConcrete {
    public constructor() {
        super('minecraft:red_concrete', ConcreteColorType.Red);
    }
}
