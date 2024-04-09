export interface NetworkInterface {
    tick(): void;

    initialize(): void;

    handleOpenSession(...params: any): boolean;

    handleRawPacket(...params: any): void;

    handleCloseSession(...params: any): boolean;

    shutdown(): void;
}
