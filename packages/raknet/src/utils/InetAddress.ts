/**
 * Represents an IP address and port.
 */
export default class InetAddress {
    private readonly address: string;
    private readonly port: number;
    private readonly version: number;

    public get [Symbol.toStringTag](): string {
        return `InetAddress(${this.toString()})`;
    }

    /**
     * Constructs an InetAddress.
     * @param {string} address - The IP address.
     * @param {number} port - The port.
     * @param {number} [version=4] - The IP version.
     * @example
     * ```typescript
     * const address = new InetAddress('0.0.0.0', 19132);
     * ```
     */
    public constructor(address: string, port: number, version = 4) {
        this.address = address;
        this.port = port;
        this.version = version;
    }

    /**
     * Returns the string representation of the IP address and port.
     * @returns {string} The string representation of the IP address and port.
     */
    public toString(): string {
        return `${this.address}:${this.port}`;
    }

    /**
     * Returns the IP address.
     * @returns {string} The IP address.
     */
    public getAddress(): string {
        return this.address;
    }

    /**
     * Returns the port.
     * @returns {number} The port.
     */
    public getPort(): number {
        return this.port;
    }

    /**
     * Returns the IP version.
     * @returns {number} The IP version.
     */
    public getVersion(): number {
        return this.version;
    }

    /**
     * Returns the token of the IP address and port.
     * @returns {string} The token of the IP address and port.
     */
    public toToken(): string {
        return `${this.address}:${this.port}`;
    }
}
