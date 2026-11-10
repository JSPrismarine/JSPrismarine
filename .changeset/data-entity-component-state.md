---
"@jsprismarine/prismarine": patch
---

Save a data-driven entity's component state. A mob saved mid-timer, mid-cooldown or half out of air used to come back with every timer restarted and full air; the saved record now carries its component state and the entity resumes where it was. Records written by earlier versions still load, with the components' initial state.
