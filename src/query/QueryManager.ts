import Prismarine from "../prismarine";
import udp from 'dgram';

export default class QueryManager {
    private server?: udp.Socket;

    constructor(server: Prismarine) {
        if (!server.getConfig().get('enable-query', true))
            return;

        // TODO: setup query
        const port = server.getConfig().get('query-port', 25565)
        this.server = udp.createSocket('udp4');

        this.server.on('message', (message) => {
            console.log(message.toString());
        });

        this.server.bind(port);
    }
};
