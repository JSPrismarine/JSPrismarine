import WhiteConcrete, { ConcreteColorType } from './WhiteConcrete';

export default class MagentaConcrete extends WhiteConcrete {
    public constructor() {
        super('minecraft:magenta_concrete', ConcreteColorType.Magenta);
    }
}
