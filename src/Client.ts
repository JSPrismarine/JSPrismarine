import LoggerBuilder from './utils/Logger';
import Connector from './network/raknet/Connector';

export default class Client {
    private logger: LoggerBuilder;
    private connector: Connector;

    constructor() {
        this.logger = new LoggerBuilder();
        this.connector = new Connector(this.logger);

        this.connector.on('listening', () => {
            this.logger.info(
                'JSPrismarine client is now attempting to connect...'
            );
        });
    }

    connect(address: string, port: number) {
        this.connector.connect(address, port);
    }
}
