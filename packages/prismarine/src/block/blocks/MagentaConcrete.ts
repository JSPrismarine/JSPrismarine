import WhiteConcrete, { ConcreteColorType } from './WhiteConcrete.js';

export default class MagentaConcrete extends WhiteConcrete {
    public constructor() {
        super('minecraft:magenta_concrete', ConcreteColorType.Magenta);
    }
}
