/**
 * The `PlayStatus` enum carried by `PlayStatusPacket`, numbered as the protocol 2193 docs list
 * them. Member names follow gophertunnel; the comment on each gives the docs name, so compare
 * by value when the two disagree.
 */
enum PlayStatusType {
    /** Docs: `LoginSuccess`. */
    LoginSuccess = 0,
    /** Docs: `LoginFailed_ClientOld`. */
    LoginFailedClient = 1,
    /** Docs: `LoginFailed_ServerOld`. */
    LoginFailedServer = 2,
    /** Docs: `PlayerSpawn`. */
    PlayerSpawn = 3,
    /** Docs: `LoginFailed_InvalidTenant`. */
    LoginFailedInvalidTenant = 4,
    /** Docs: `LoginFailed_EditionMismatchEduToVanilla`. */
    LoginFailedVanillaEdu = 5,
    /** Docs: `LoginFailed_EditionMismatchVanillaToEdu`. */
    LoginFailedEduVanilla = 6,
    /** Docs: `LoginFailed_ServerFullSubClient`. */
    LoginFailedServerFull = 7,
    /** Docs: `LoginFailed_EditorMismatchEditorToVanilla`. */
    LoginFailedEditorVanilla = 8,
    /** Docs: `LoginFailed_EditorMismatchVanillaToEditor`. */
    LoginFailedVanillaEditor = 9
}

export default PlayStatusType;
