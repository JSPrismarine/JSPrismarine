import { Mob } from '../Mob';

export default class Cow extends Mob {
    public static MOB_ID = 'minecraft:cow';

    public override getType(): string {
        return Cow.MOB_ID;
    }
}
