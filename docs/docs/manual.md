---
sidebar_position: 5
---

# User Manual: How Tobira works

This document is a loose collection of various additional information, defining some terms and explaining how some details of Tobira work.


## Pages

Tobira contains a hierarchy of *pages*, also called the page tree.
There is one home page (also called start page, or root), which is the first thing you see when visiting Tobira.
Each page can have sub-pages.
Moderators can add and remove these pages.

In addition to this main page tree, each user (who is allowed to) can manage their own page tree.
These pages are called "user pages".
User pages do not appear in the search or anywhere in the main page tree; one has to know the username or link to a user page in order to visit it.

Each page contains an ordered list of "content blocks".
Currently there are title blocks, text blocks, series blocks and video blocks.


## Routes

These are the different routes that exist in Tobira.
The values `in this style` are the URL paths, e.g. what the browser will show after your domain (e.g. `tobira.my-university.de`) when visiting that route.

- **Main pages**: `/<path/to/page>`.
  Shows a page in the page tree described above.
  There are certain limitations on the path segments that can be used here in order to not collide with the routes defined below.
  Examples:
    - `/lectures/biology/2023`
    - `/conferences`
    - `/` (*home page*)


- **User pages**: `/@<userid>/<path/to/page>`.
  User pages as described above.
  They always start with `/@` and then the user ID of the owning user.
  Examples:
    - `/@peter/math-explanations`
    - `/@peter` (user *root* page)


- **Videos**: `/<path/to/page>/v/<videoid>`.
  Videos with *page context*, meaning: a video (or its series) is included on a page.
  When clicking on the video's thumbnail, you get to this page.
  The navigation of the page is shown.
  Also works for user pages.
  Examples:
    - `/lectures/biology/2023/v/L5CUekz9uQ0`
    - `/v/ENIGYvfETox`
    - `/@peter/dancing/v/HFl9DghSw4x`


- **Video direct links**: `/!v/<videoid>` or `/!v/:<oc_id>`.
  Videos without *page context*.
  The home page navigation is shown.
  Useful when the video is not included in any page yet, or if you want to generate a link from an Opencast ID.
  Examples:
    - `/!v/L5CUekz9uQ0`
    - `/!v/:25e82f02-db10-4ba6-937f-3252353cfbe8`


- **Series direct links**: `/!s/<seriesid>` or `/!s/:<oc_id>`. Exactly like video direct links, but for series.

- **Management routes**: `/~manage/<...>` and `/~upload`. For various "management" pages, like "my videos" or modifying a page.

- **Other internal routes**: `/~<...>`, e.g. `/~about`.


## "Listed" and being findable via search

User pages *cannot* be found via search.
Non-user pages *can* be found via search.
For videos and series, it gets more complicated.

The findability for both depends on whether they are included in a page.
Included means that a content block (the things you can put on a page) refers to them.
A video is "included in a page" if that page has a video block with that video, or if that page has a series block with that video's series.
Similarly, a series is included in a page, if a series block refers to it or if a video block refers to any of its videos.

If and only if a video/series is included in any non-user page, it is findable via search.
(Note: currently, series are not findable via search at all, but simply because it was not implemented yet. The described rules will be used in the future.)
