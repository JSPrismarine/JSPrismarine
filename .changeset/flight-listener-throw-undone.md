---
"@jsprismarine/prismarine": patch
---

A `playerToggleFlight` listener that throws now fails the flight request's input, which undoes what the listener wrote. The handler started the toggle in an async function, so the throw became a rejected send and the listener's writes stayed.
