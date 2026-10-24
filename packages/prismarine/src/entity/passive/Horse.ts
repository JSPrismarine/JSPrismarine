import { Mob } from '../Mob';

export default class Horse extends Mob {
    public static MOB_ID = 'minecraft:horse';

    public override getType(): string {
        return Horse.MOB_ID;
    }
}
