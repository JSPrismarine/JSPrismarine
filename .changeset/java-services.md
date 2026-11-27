---
'@jsprismarine/prismarine': minor
---

Java Edition clients now send their settings to the server. The language becomes the player's locale, which scripts read, and the view distance sets how far out chunks are sent, capped at the server's own as vanilla caps it. A changed setting applies at once. The server pings a client while it configures and drops one that stops answering, answers the ping chart on the client's debug screen, reads the client's brand, sends the server's description once the player is in play, and `/transfer` and the script API's transfer send a Java player to another server.

Breaking: `SessionPresenter` gains a required `transfer(host, port)`, and `JavaPlayers.join` takes the client's locale after the address. Code that implements either has to add them.
