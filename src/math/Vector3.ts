export default class Vector3 {
    private x: number;
    private y: number;
    private z: number;

    constructor(x = 0, y = 0, z = 0) {
        this.x = x;
        this.y = y;
        this.z = z;
    }

    public setX(x = 0) {
        this.x = x;
    }

    public setY(y = 0) {
        this.y = y;
    }

    public setZ(z = 0) {
        this.z = z;
    }

    public getX(): number {
        return this.x;
    }

    public getY(): number {
        return this.y;
    }

    public getZ(): number {
        return this.z;
    }
}
