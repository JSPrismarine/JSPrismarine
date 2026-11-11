/** The kinds of signal NetherNet's signaling carries, by the word that starts each one. */
export const SignalType = {
    ConnectRequest: 'CONNECTREQUEST',
    ConnectResponse: 'CONNECTRESPONSE',
    CandidateAdd: 'CANDIDATEADD',
    ConnectError: 'CONNECTERROR'
} as const;

/** One of the {@link SignalType} words. */
export type SignalType = (typeof SignalType)[keyof typeof SignalType];

/** The codes a `CONNECTERROR` signal carries, as Bedrock numbers them. */
export const ErrorCode = {
    None: 0,
    DestinationNotLoggedIn: 1,
    NegotiationTimeout: 2,
    WrongTransportVersion: 3,
    FailedToCreatePeerConnection: 4,
    ICE: 5,
    ConnectRequest: 6,
    ConnectResponse: 7,
    CandidateAdd: 8,
    InactivityTimeout: 9,
    FailedToCreateOffer: 10,
    FailedToCreateAnswer: 11,
    FailedToSetLocalDescription: 12,
    FailedToSetRemoteDescription: 13,
    NegotiationTimeoutWaitingForResponse: 14,
    NegotiationTimeoutWaitingForAccept: 15,
    IncomingConnectionIgnored: 16,
    SignalingParsingFailure: 17,
    SignalingUnknownError: 18,
    SignalingUnicastMessageDeliveryFailed: 19,
    SignalingBroadcastDeliveryFailed: 20,
    SignalingMessageDeliveryFailed: 21,
    SignalingTurnAuthFailed: 22,
    SignalingFallbackToBestEffortDelivery: 23,
    NoSignalingChannel: 24,
    NotLoggedIn: 25,
    SignalingFailedToSend: 26
} as const;

const SIGNAL_TYPES: ReadonlySet<string> = new Set(Object.values(SignalType));

/** Whether a word is one of the {@link SignalType} words. */
const isSignalType = (word: string): word is SignalType => SIGNAL_TYPES.has(word);

/**
 * One signal: `<TYPE> <connection id> <data>`, where the data is an SDP description, a candidate
 * line or an error code. The network ID is the peer's, which the carrier knows, not the text.
 */
export class SignalStructure {
    /**
     * @param type - What the signal is.
     * @param connectionId - The connection the client picked an ID for.
     * @param data - The description, candidate or error code.
     * @param networkId - The other side's network ID, when the carrier names it.
     */
    public constructor(
        public readonly type: SignalType,
        public readonly connectionId: bigint,
        public readonly data: string,
        public networkId?: bigint
    ) {}

    /**
     * Parses a signal's text.
     * @param message - The text, as LAN discovery or a signaling service carries it.
     * @returns The signal.
     * @throws {Error} When the type is unknown or the connection ID is not an unsigned integer.
     */
    public static fromString(message: string): SignalStructure {
        const first = message.indexOf(' ');
        const second = first < 0 ? -1 : message.indexOf(' ', first + 1);
        const type = first < 0 ? message : message.slice(0, first);
        const id = first < 0 ? '' : message.slice(first + 1, second < 0 ? undefined : second);
        if (!isSignalType(type)) throw new Error(`Unknown NetherNet signal type ${JSON.stringify(type)}`);
        if (!/^\d+$/.test(id)) throw new Error(`NetherNet signal connection ID ${JSON.stringify(id)} is not a number`);
        return new SignalStructure(type, BigInt(id), second < 0 ? '' : message.slice(second + 1));
    }

    /** The signal's text. */
    public toString(): string {
        return `${this.type} ${this.connectionId} ${this.data}`;
    }
}
