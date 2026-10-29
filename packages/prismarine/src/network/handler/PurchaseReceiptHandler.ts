import type Server from '../../Server';
import type PlayerSession from '../PlayerSession';
import type PurchaseReceiptPacket from '../packet/PurchaseReceiptPacket';
import type PacketHandler from './PacketHandler';

/**
 * The receipts a client sends for the store offers it owns.
 *
 * The count is recorded at debug level and the receipts are dropped. Known gap: the server
 * has no store offers and no entitlements, so there is nothing to grant. Verifying a receipt
 * also needs a call to Mojang's marketplace, which only partnered servers can make.
 */
export default class PurchaseReceiptHandler implements PacketHandler<PurchaseReceiptPacket> {
    public static PacketName = 'PurchaseReceiptPacket';

    /** Logs how many receipts arrived. */
    public handle(packet: PurchaseReceiptPacket, server: Server, session: PlayerSession): void {
        server
            .getLogger()
            .debug(
                `${session.getPlayer().getName()} sent ${packet.purchaseReceipts.length} purchase receipts, which the server does not verify`,
                'PurchaseReceiptHandler/handle'
            );
    }
}
