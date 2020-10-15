export default class Vector3 {
    private x: number;
    private y: number;
    private z: number;

    constructor(x = 0, y = 0, z = 0) {
        this.x = x;
        this.y = y;
        this.z = z;
    }

    public setX(x: number) {
        this.x = x;
    }

    public setY(y: number) {
        this.y = y;
    }

    public setZ(z: number) {
        this.z = z;
    }

    public getX() {
        return this.x;
    }

    public getY() {
        return this.y;
    }

    public getZ() {
        return this.z;
    }

}
