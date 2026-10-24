import { Mob } from '../Mob';

export default class Mooshroom extends Mob {
    public static MOB_ID = 'minecraft:mooshroom';

    public override getType(): string {
        return Mooshroom.MOB_ID;
    }
}
