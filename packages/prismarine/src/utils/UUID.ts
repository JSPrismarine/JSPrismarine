import { UUID as NetUUID } from '@jsprismarine/protocol';
import { randomUUID } from 'crypto';

/**
 * Represents a UUIDv4.
 */
export class UUID extends NetUUID {
    /**
     * Generates a new UUIDv4 using random values.
     *
     * @returns A new UUIDv4 instance.
     */
    public static fromRandom(): UUID {
        const uuid = randomUUID().replace(/-/g, '');
        return new UUID(BigInt('0x' + uuid.slice(0, 16)), BigInt('0x' + uuid.slice(16, 32)));
    }

    /**
     * Generates a random UUIDv4 string.
     *
     * @returns A randomly generated UUIDv4.
     */
    public static randomString(): string {
        return randomUUID();
    }

    /**
     * Creates a new UUID instance from a string representation.
     * @param uuid - The string representation of the UUIDv4.
     * @returns A new UUID instance.
     */
    public static fromString(uuid: string): UUID {
        uuid = uuid.replace(/-/g, '');
        return new UUID(BigInt('0x' + uuid.slice(0, 16)), BigInt('0x' + uuid.slice(16, 32)));
    }

    /**
     * Converts the UUID to a string representation.
     * @returns The string representation of the UUID.
     */
    public toString(): string {
        const most = this.most.toString(16);
        const least = this.least.toString(16);
        return (
            most.slice(0, 8) +
            '-' +
            most.slice(8, 12) +
            '-' +
            most.slice(12, 16) +
            '-' +
            least.slice(0, 4) +
            '-' +
            least.slice(4, 16)
        );
    }

    /**
     * Checks if the current UUID is equal to the provided UUID.
     * @param uuid - The UUID to compare with.
     * @returns `true` if the UUIDs are equal, `false` otherwise.
     */
    public equals(uuid: UUID): boolean {
        return this.most === uuid.most && this.least === uuid.least;
    }
}
