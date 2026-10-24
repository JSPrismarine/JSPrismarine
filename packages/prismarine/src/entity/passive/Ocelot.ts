import { Mob } from '../Mob';

export default class Ocelot extends Mob {
    public static MOB_ID = 'minecraft:ocelot';

    public override getType(): string {
        return Ocelot.MOB_ID;
    }
}
