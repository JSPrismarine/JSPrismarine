/**
 * The docs' `PlayStatus` enum, the `Status` of a `PlayStatusPacket`, with the docs' member
 * names and the values the protocol 2193 docs list.
 */
enum PlayStatus {
    LoginSuccess = 0,
    LoginFailed_ClientOld = 1,
    LoginFailed_ServerOld = 2,
    PlayerSpawn = 3,
    LoginFailed_InvalidTenant = 4,
    LoginFailed_EditionMismatchEduToVanilla = 5,
    LoginFailed_EditionMismatchVanillaToEdu = 6,
    LoginFailed_ServerFullSubClient = 7,
    LoginFailed_EditorMismatchEditorToVanilla = 8,
    LoginFailed_EditorMismatchVanillaToEditor = 9
}

export default PlayStatus;
