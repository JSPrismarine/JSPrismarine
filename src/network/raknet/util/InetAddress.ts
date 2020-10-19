import { RemoteInfo } from "dgram";

export interface InetAddressData {
    address: string;
    port: number;
    family?: "ipv4" | "ipv6";
}

export default class InetAddress {
    private readonly address: string;
    private readonly port: number;
    private readonly family: string;

    constructor(addressInfo: InetAddressData) {
        this.address = addressInfo.address;
        this.port = addressInfo.port;
        this.family = addressInfo.family ?? "ipv4";
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

    public toToken(): string {
        return `${this.address}:${this.port}`;
    }

    public static fromRemoteInfo(rinfo: RemoteInfo) {
        return new InetAddress({ 
            address: rinfo.address,
            port: rinfo.port
        });
    }
}