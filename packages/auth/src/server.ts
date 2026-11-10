/** The server side of a Bedrock login: checking that it belongs to the account it names. */
export { LoginRefused, MojangKeys, loginKeys, useLoginKeys, verifyLogin } from './LoginVerifier';
export type { LoginKeySource, VerifiedLogin } from './LoginVerifier';
