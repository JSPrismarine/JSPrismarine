import { Entity } from '../Entity';

export default class Camera extends Entity {
    public static MOB_ID = 'minecraft:tripod_camera';

    public override getType(): string {
        return Camera.MOB_ID;
    }
}
