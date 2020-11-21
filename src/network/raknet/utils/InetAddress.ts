export default class InetAddress {
    private address: string;
    private port: number;
    private version: number;

    public constructor(address: string, port: number, version = 4) {
        this.address = address;
        this.port = port;
        this.version = version;
    }

    public getAddress(): string {
        return this.address;
    }

    public getPort(): number {
        return this.port;
    }

    public getVersion(): number {
        return this.version;
    }
}
