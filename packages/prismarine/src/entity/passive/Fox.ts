import { Mob } from '../Mob';

export default class Fox extends Mob {
    public static MOB_ID = 'minecraft:fox';

    public override getType(): string {
        return Fox.MOB_ID;
    }
}
