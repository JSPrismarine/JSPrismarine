import type { NativeNetwork } from './NativeNetwork';

/** The classes of a datagram on a shared port, as `JSP_CLASS_*` numbers them. */
export const DatagramClass = {
    raknet: 1,
    raknetOffline: 2,
    stun: 3,
    dtls: 4,
    unsure: 5
} as const;

/** One of the {@link DatagramClass} values. */
export type DatagramClass = (typeof DatagramClass)[keyof typeof DatagramClass];

/**
 * Classifies a datagram the way the native side does on a shared port, by calling the native
 * classifier itself.
 * @param network - The loaded library.
 * @param datagram - The datagram's bytes.
 * @returns Its class.
 */
export const classify = (network: NativeNetwork, datagram: Uint8Array): number =>
    network.symbols.jsp_classify(datagram, datagram.byteLength);
