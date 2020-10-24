export default class Vector3 {
    private x: UnsignedVarInt;
    private y: UnsignedVarInt;
    private z: UnsignedVarInt;

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
        return this.x as number;
    }

    public getY(): number {
        return this.y as number;
    }

    public getZ(): number {
        return this.z as number;
    }

}
