import type { Logger } from '@jsprismarine/logger';
import { describe, expect, it } from 'vitest';

import type { Config } from '../config/Config';
import type Server from '../Server';
import { stub } from '../testing/stub.test.helper';
import type ClientConnection from './ClientConnection';
import { ConnectionContexts } from './connectionContexts';
import { takesConnection } from './handler/ConnectionContext';

describe('network/connectionContexts', () => {
    it('tells a handler of the phases before a session from one of a session', () => {
        expect(takesConnection({ phases: ['handshake'] })).toBe(true);
        expect(takesConnection({ phases: ['login', 'encryption'] })).toBe(true);
        expect(takesConnection({ phases: ['resourcePacks', 'play'] })).toBe(false);
        expect(takesConnection({ phases: ['login', 'play'] })).toBe(false);
    });

    it('hands the connection over and reads the server only for the parts a handler uses', () => {
        const reads: string[] = [];
        const logger = stub<Logger>();
        const config = stub<Config>();
        const server = stub<Server>({
            getLogger: () => {
                reads.push('logger');
                return logger;
            },
            getConfig: () => {
                reads.push('config');
                return config;
            }
        });
        const connection = stub<ClientConnection>();

        const context = ConnectionContexts.of(server).contextOf(connection);
        expect(context.connection).toBe(connection);
        expect(reads).toStrictEqual([]);

        expect(context.log).toBe(logger);
        expect(context.config).toBe(config);
        expect(reads).toStrictEqual(['logger', 'config']);
    });

    it('builds one set of contexts for each server', () => {
        const server = stub<Server>();
        const first = ConnectionContexts.of(server);
        // Compared by identity: a failed match would print the contexts, and printing one reads
        // the services a stub server does not have.
        expect(ConnectionContexts.of(server) === first).toBe(true);
        expect(ConnectionContexts.of(stub<Server>()) === first).toBe(false);
    });
});
