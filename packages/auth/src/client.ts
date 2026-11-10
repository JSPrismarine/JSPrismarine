/**
 * The client side of a Bedrock login: the providers that present an identity, and the client
 * data they sign.
 */
export { createClientData } from './ClientData';
export type { AnimatedImage, ClientDataOptions, ClientDataPayload } from './ClientData';
export { createAuthProvider } from './createAuthProvider';
export type { AuthProviderName, AuthProviderOptions } from './createAuthProvider';
export { DEFAULT_SKIN_RESOURCE_PATCH, SKIN_HEIGHT, SKIN_WIDTH, createDefaultSkinImage } from './DefaultSkin';
export type * from './IAuthProvider';
export { IdentityKey } from './IdentityKey';
export { KeyedAuthProvider } from './KeyedAuthProvider';
export { default as OfflineAuthProvider } from './OfflineAuthProvider';
export type { OfflineAuthOptions } from './OfflineAuthProvider';
export { default as XboxAuthProvider } from './XboxAuthProvider';
export type { DeviceCode, XboxAuthOptions, XboxLogin, XboxTokenSource } from './XboxAuthProvider';
