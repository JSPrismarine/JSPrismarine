import { Entity } from '../Entity';

export default class FireworksRocket extends Entity {
    public static MOB_ID = 'minecraft:fireworks_rocket';

    public override getType(): string {
        return FireworksRocket.MOB_ID;
    }
}
