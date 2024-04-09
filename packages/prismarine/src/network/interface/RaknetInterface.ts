import type { InetAddress, Protocol, RakNetSession } from '@jsprismarine/raknet';
import { RakNetListener } from '@jsprismarine/raknet';
import { BaseInterface } from './BaseInterface';
import type { EventManager, QueryManager } from '../../Managers';
import { Server, type Logger } from '../../';
import { RaknetConnectEvent, RaknetDisconnectEvent, RaknetEncapsulatedPacketEvent } from '../../events/Events';
import Timer from '../../utils/Timer';
import ClientConnection from '../ClientConnection';
import { buildRakNetServerName } from '../../utils/ServerName';

interface InterfaceConfig {
    address: string;
    port: number;
    maxConnections: number;
    offlineMode: boolean;
}

export class RaknetInterface extends BaseInterface {
    private raknet: RakNetListener;

    public constructor(
        eventManager: EventManager,
        private logger: Logger,
        private queryManager: QueryManager,
        private config: InterfaceConfig
    ) {
        super(eventManager);
        this.raknet = new RakNetListener(config.maxConnections, config.offlineMode); // pass `getMessageOfTheDay` callback method to send MOTD
        this.raknet.setServerName(buildRakNetServerName(Server.instance, this.getServerGuid()));
    }

    // TODO: getMessageOfTheDay(): string

    public initialize(): void {
        // Should try/catch this, remove loggin in raknet ._.
        this.raknet.start(this.config.address, this.config.port);

        this.raknet.on('openConnection', this.handleOpenSession.bind(this));
        this.raknet.on('closeConnection', this.handleCloseSession.bind(this));
        this.raknet.on('encapsulated', this.handleRawPacket.bind(this));
        this.raknet.on('raw', this.handleRawBuffer.bind(this));
    }

    public handleOpenSession(session: RakNetSession): boolean {
        const event = new RaknetConnectEvent(session);
        this.eventManager.emit('raknetConnect', event);

        if (event.isCancelled()) {
            session.disconnect();
            return false;
        }

        const token = session.getAddress().toToken();
        if (this.connections.has(token)) {
            this.logger.error(
                `Another client with token (${token}) is already connected!`,
                'Server/listen/openConnection'
            );
            session.disconnect('Already connected from another location');
            return false;
        }

        const timer = new Timer();
        this.logger.debug(`${token} is attempting to connect`, 'Server/listen/openConnection');
        this.connections.set(token, new ClientConnection(session, this.logger));
        this.logger.verbose(`New connection handling took ${timer.stop()} ms`, 'Server/listen/openConnection');
        return true;
    }

    public handleRawPacket(packet: Protocol.Frame, inetAddr: InetAddress): void {
        // console.log('handleRawPacket', packet, inetAddr);
        const event = new RaknetEncapsulatedPacketEvent(inetAddr, packet);
        this.eventManager.emit('raknetEncapsulatedPacket', event);

        const conn = this.connections.get(inetAddr.toToken());
        if (!conn) {
            this.logger.error(
                `Got a packet from a closed connection ${inetAddr.toToken()}`,
                'RaknetInterface/handleRawPacket'
            );
            return;
        }
        conn.handleRawPacket(packet.content);
    }

    public handleRawBuffer(buffer: Buffer, inetAddr: InetAddress): void {
        try {
            this.queryManager.onRaw(buffer, inetAddr);
        } catch (error: unknown) {
            this.logger.error(error, 'Server/listen/raw');
            this.logger.verbose(`QueryManager failed with error: ${error}`, 'Server/listen/raw');
        }
    }

    public handleCloseSession(inetAddr: InetAddress, reason: string): boolean {
        const event = new RaknetDisconnectEvent(inetAddr, reason);
        this.eventManager.emit('raknetDisconnect', event);

        const time = Date.now();
        const token = inetAddr.toToken();
        const connection = this.connections.get(token);

        if (!connection) {
            this.logger.error(
                `Got a close connection from a closed connection ${token}`,
                'RaknetInterface/handleCloseSession'
            );
            return false;
        }

        connection.disconnect(reason); // Disconnect the client safely)

        this.connections.delete(token);
        this.logger.debug(`${token} disconnected due to ${reason}`, 'RaknetInterface/handleCloseSession');
        this.logger.debug(
            `Player destruction took about ${Date.now() - time} ms`,
            'RaknetInterface/handleCloseSession'
        );
        return true;
    }

    public tick(): void {
        for (const conn of this.connections.values()) {
            conn.tick();
        }
    }

    // temp fix
    public getServerGuid(): bigint {
        return this.raknet.getServerGuid();
    }

    public shutdown(): void {
        this.raknet.removeAllListeners();
        this.raknet.kill();
    }
}
