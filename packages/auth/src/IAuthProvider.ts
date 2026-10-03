/**
 * The two JWT blobs a `Login` packet carries.
 *
 * Deliberately the *encoded* form rather than the data behind it: an offline provider signs
 * these itself, and an Xbox one receives most of the chain already signed by Mojang and
 * cannot reconstruct it. What they have in common is the pair of strings that goes on the
 * wire, so that is what the interface is about.
 */
export interface LoginCredentials {
    /**
     * `{"chain": [...]}` - one JWT per link. Offline that is a single self-signed token;
     * authenticated it is the client's own token followed by Mojang's.
     */
    readonly chainData: string;
    /** One JWT: skin, device, language, and the address the client thinks it dialled. */
    readonly clientData: string;
}

/** Who the player is, as far as the login is concerned. */
export interface Identity {
    /** Empty when not authenticated. A server in online mode refuses that. */
    readonly xuid: string;
    /** The uuid the client is known by. The server rejects a login with no identity. */
    readonly identity: string;
    readonly displayName: string;
    readonly titleId?: string;
}

export interface LoginRequest {
    /** Where we are connecting, as the client reports it: `host:port`. */
    readonly serverAddress: string;
    /** The protocol version being spoken, echoed into the client data. */
    readonly protocolVersion: number;
}

/**
 * Where a login identity comes from.
 *
 * The seam exists so that what the bot harness needs - hundreds of throwaway identities, no
 * network, no token cache - and what a real client needs are the same shape to everything
 * upstream. It is also what keeps Xbox Live out of the headless build: a provider is chosen
 * at the edge, and nothing in the client core imports one.
 */
export interface IAuthProvider {
    /** For logs and for choosing between cached sessions. */
    readonly name: string;

    /**
     * The identity this provider will log in as.
     *
     * Available before {@link createLoginCredentials} so a caller can label a connection
     * before it has made one - a bot harness reporting which of five hundred it is waiting
     * on, say.
     */
    getIdentity(): Promise<Identity>;

    /**
     * Signs, or fetches, the credentials for one login.
     *
     * Called once per connection attempt rather than cached, because the client data
     * carries the address being dialled and the chain carries an expiry.
     */
    createLoginCredentials(request: LoginRequest): Promise<LoginCredentials>;

    /**
     * The public half of the key the chain is signed with, DER encoded and base64'd - the
     * same string the chain's `identityPublicKey` claim carries.
     *
     * Encryption derives its shared secret from this key, so a provider has to expose it
     * even though nothing in the login itself asks for it separately.
     */
    getIdentityPublicKey(): Promise<string>;

    /**
     * The private key, for the ECDH half of the encryption handshake.
     *
     * Returned as a PEM-encoded PKCS#8 string rather than a `KeyObject` so that a provider
     * backed by something that is not node's crypto stays possible.
     */
    getIdentityPrivateKey(): Promise<string>;
}
