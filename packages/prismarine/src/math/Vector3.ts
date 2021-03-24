import BinaryStream from '@jsprismarine/jsbinaryutils';

export default class Vector3 {
    protected x: number;
    protected y: number;
    protected z: number;

    public constructor(x = 0, y = 0, z = 0) {
        this.x = x;
        this.y = y;
        this.z = z;
    }

    public setX(x = 0): void {
        this.x = x;
    }

    public setY(y = 0): void {
        this.y = y;
    }

    public setZ(z = 0): void {
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

    public equals(vector: Vector3): boolean {
        return JSON.stringify(this) === JSON.stringify(vector);
    }

    public networkSerialize(stream: BinaryStream): void {
        stream.writeLFloat(this.x);
        stream.writeLFloat(this.y);
        stream.writeLFloat(this.z);
    }

    public static networkDeserialize(stream: BinaryStream): Vector3 {
        return new Vector3(stream.readLFloat(), stream.readLFloat(), stream.readLFloat());
    }
}
