import { Entity } from '../Entity';

export default class ElderGuardianGhost extends Entity {
    public static MOB_ID = 'minecraft:elder_guardian_ghost';

    public override getType(): string {
        return ElderGuardianGhost.MOB_ID;
    }
}
