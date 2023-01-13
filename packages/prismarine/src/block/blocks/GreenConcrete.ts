import WhiteConcrete, { ConcreteColorType } from './WhiteConcrete.js';

export default class GreenConcrete extends WhiteConcrete {
    public constructor() {
        super('minecraft:green_concrete', ConcreteColorType.Green);
    }
}
