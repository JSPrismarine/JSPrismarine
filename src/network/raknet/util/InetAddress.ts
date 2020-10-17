export interface InetAddressData {
    address: string;
    port: number;
    family?: "IPv4" | "IPv6";
}

export default class InetAddress {
    private readonly address: string;
    private readonly port: number;
    private readonly family: string;

    constructor(addressInfo: InetAddressData) {
        this.address = addressInfo.address;
        this.port = addressInfo.port;
        this.family = addressInfo.family ?? "IPv4";
    }

    public getAddress(): string {
        return this.address;
    }

    public getPort(): number {
        return this.port;
    }

    public getFamily(): string {
        return this.family;
    }
}