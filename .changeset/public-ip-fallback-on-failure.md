---
'@jsprismarine/nethernet': minor
'@jsprismarine/prismarine': patch
'@jsprismarine/server': patch
---

The looked-up public address is now a fallback for a player who could not connect. The server looks it up only after a player reaches none of the addresses an answer offered, and gives it to that player's next join beside the configured and dialed addresses, never in place of `server-public-ip`. Before, it looked the address up at every start with `server-public-ip` empty and offered it to any join whose answer had no public address, such as a player on the local network.

`HttpSignaling` passes `sign` a third argument, whether the client's last answer reached it at no address, and takes an `onUnreached` callback. `withAdvertisedCandidates` adds the fallback address whenever it is given, and `tracePeerConnection` takes a callback told whether the client reached an address in the answer.
