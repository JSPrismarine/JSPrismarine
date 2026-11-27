---
'@jsprismarine/client': patch
---

Add `ClientWorld`, which keeps what a client learns from the server's packets: where its player is, which chunks it holds, the actors it can see, its health and inventory, the chat, titles and forms it was sent, and why it was disconnected. A client decodes the extra packets only after a `ClientWorld` is attached to it.
