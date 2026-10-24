---
'@jsprismarine/prismarine': patch
---

`ItemStackRequestHandler` refuses a request whose id is not a negative odd client request id, one with no actions, and one whose amount is outside 1 to 64, answering each with an `Error` under the same id. A step that throws is now rolled back and answered as a refusal instead of leaving the request unanswered. A successful response names only the containers whose slots changed.
