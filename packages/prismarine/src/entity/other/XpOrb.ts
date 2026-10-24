import { Entity } from '../Entity';

export default class ExperienceOrb extends Entity {
    public static MOB_ID = 'minecraft:xp_orb';

    public override getType(): string {
        return ExperienceOrb.MOB_ID;
    }
}
