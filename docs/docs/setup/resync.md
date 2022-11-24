---
sidebar_position: 12
---

# Resync Opencast data

Sometimes during Tobira development, we require more information about an event or series. (For example, an event's subtitles.)
Then, we will (a) update the Tobira Harvest API inside Opencast to provide that data, and (b) update Tobira to store that data.

However, events & series that have already been synced are not updated automatically and thus lack that additional new information.
To fix that, you have to perform a manual "resync".
This is triggered by running `tobira sync reset`.
Afterwards, the next time Tobira synchronizes (which is likely happening soon as part of your `tobira worker` process), it will synchronize all data.

:::caution
As with the initial sync, this will put some stress on your Opencast system, so maybe don't do it in the busiest of hours.
:::

