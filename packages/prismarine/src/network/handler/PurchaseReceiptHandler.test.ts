import type { Logger } from '@jsprismarine/logger';
import { describe, expect, it } from 'vitest';
import * as Handlers from '../Handlers';
import type Player from '../../Player';
import type Server from '../../Server';
import { stub } from '../../testing/stub.test.helper';
import type PlayerSession from '../PlayerSession';
import PurchaseReceiptPacket from '../packet/PurchaseReceiptPacket';
import PurchaseReceiptHandler from './PurchaseReceiptHandler';

describe('PurchaseReceiptHandler', () => {
    it('logs how many receipts arrived', () => {
        const logged: string[] = [];
        const server = stub<Server>({
            getLogger: () => stub<Logger>({ debug: (...message) => void logged.push(message[0] ?? '') })
        });
        const session = stub<PlayerSession>({ getPlayer: () => stub<Player>({ getName: () => 'Steve' }) });
        const packet = Object.assign(new PurchaseReceiptPacket(), { purchaseReceipts: ['a', 'b'] });

        new PurchaseReceiptHandler().handle(packet, server, session);

        expect(logged).toEqual(['Steve sent 2 purchase receipts, which the server does not verify']);
    });

    it('is registered for packet 0x5c', () => {
        expect(Handlers.PurchaseReceiptHandler).toBe(PurchaseReceiptHandler);
        expect(PurchaseReceiptHandler.NetID).toBe(0x5c);
    });
});
