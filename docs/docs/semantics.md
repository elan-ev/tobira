---
sidebar_position: 5
---

# Semantics and definitions

This document is a loose collection of various additional information, defining some terms and explaining how some details of Tobira work.
This hopefully enables more precise communication in Tobira-related discussions.


## Common UI elements

![](./ui-elements.png)

## Content Pages

Tobira contains a hierarchy of *content pages*, collectively also called the *page tree*.
There is one root *content page* (also called home page or start page), which is the first thing you see when visiting Tobira.
Each *content page* can have sub-*content pages*, which page-moderators can add and remove.
Each *content page* has a name (which is shown at the very top) and contains an ordered list of "content blocks".
Currently, there are title blocks, text blocks, series blocks and video blocks.

In Tobira's user-facing UI, *content pages* are simply called "pages".
But as "page" is a very generic term, this document will use the term *content page* to specifically refer to these user-editable pages described in this section.

In addition to this main page tree, each user (who is allowed to as per `auth.user_realm_role` configuration) can create and manage their own page tree.
These *content pages* are called "user pages".
User pages (and content only included on user pages) do not appear in the search or anywhere in the main page tree; one has to know the username or link to a user page in order to visit it.

## Video Pages

The main place to watch a video is the video page.
It contains the video player, the video's metadata, and buttons to share and (optionally) download the video.
If the video is part of a series, the other videos of that series are shown at the bottom.

A video page can be reached via two different means: via direct link or coming from a *content page*.
This only affects the navigation and breadcrumbs.
See the next chapter for more information on this.


## Routes

Different routes exist in Tobira to access *content pages*, videos, the management section, or other features of Tobira.
The values `in this style` are the URL paths, e.g. what the browser will show after your domain (e.g. `tobira.my-university.de`) when visiting that route.

- **Main content pages**: `/<path/to/page>`.
  Shows a *content page* in the page tree.
  There are certain limitations on the path segments that can be used here in order to not collide with the routes defined below.
  Examples:
    - `/` (*home page*)
    - `/conferences`
    - `/lectures/biology/2023`


- **User pages**: `/@<userid>/<path/to/page>`.
  Shows a user page.
  They always start with `/@` and then the user ID of the owning user.
  Examples:
    - `/@peter` (user *root* page)
    - `/@peter/math-explanations`


- **Videos in context**: `/<path/to/page>/v/<videoid>` or `/<path/to/page>/v/:<oc_id>`.
  Shows a video with *page context* (meaning: a video or its series is included on a *content page*).
  The navigation of that *content page* is shown.
  This is the normal route you reach by clicking on a video included in a *content page*.
  Also works for user pages.
  Examples:
    - `/lectures/biology/2023/v/L5CUekz9uQ0`
    - `/v/ENIGYvfETox`
    - `/@peter/dance-lessons/v/HFl9DghSw4x`
    - `/@peter/dance-lessons/v/:25e82f02-db10-4ba6-937f-3252353cfbe8` (Opencast ID prefixed with `:`)


- **Video direct links**: `/!v/<videoid>` or `/!v/:<oc_id>`.
  Shows a video without *page context*.
  The home page navigation is shown.
  Useful when the video is not included in any *content page* yet, or if you want to generate a link from an Opencast ID.
  Examples:
    - `/!v/L5CUekz9uQ0`
    - `/!v/:25e82f02-db10-4ba6-937f-3252353cfbe8` (Opencast ID prefixed with `:`)


- **Series in context**: `/<path/to/page>/s/<seriesid>` or `/<path/to/page>/s/:<oc_id>`.
  Similar to video links, but can only be obtained by using the link from the series' share menu.


- **Series direct links**: `/!s/<seriesid>` or `/!s/:<oc_id>`. Exactly like video direct links, but for series.


- **Playlist in context**: `/<path/to/page>/p/<playlistid>` or `/<path/to/page>/p/:<oc_id>`. Exactly like series links, but for playlists.


- **Playlist direct links**: `/!p/<playlistid>` or `/!p/:<oc_id>`. Exactly like video and series direct links.


- **Management routes**: `/~manage/<...>`. For various "management" pages of videos, series and playlists or modifying a *content page*.
    - `/~manage/<videos|series|playlists>`: Overview pages. Lists all items of the corresponding type that the user has write access for.
    - `/~manage/<video|series|playlist>/<id>`: Details pages. Allows editing of title and description and in the case of series and playlists also their content.
    - `/~manage/<video|series|playlist>/<id>/access`: Access policy page. Allows inspecting and editing the *permissions* of the corresponding item.
    - `/~manage/create-<series|playlist>`: Create new series or playlists.
    - `/~manage/upload`: Upload videos.
    - `/~manage/realm?path=<...>`: Realm management. Allows editing realm name and path, ordering of sub pages and realm removal.
    - `/~manage/realm/content?path=<...>`: Edit realm content. Allows adding or removing various content blocks.
    - `/~manage/realm/add-child?parent=<...>`: Add sub page.

- **Other internal routes**: `/~<...>`, e.g. `/~about`.


## "Listed" and being findable via search

Entities like pages, videos and series are either "listed" or "unlisted".
This is a derived property and not something that can be toggled individually.
Only listed entities can be found via search.
Of course, for videos, the ACLs determine whether someone can see the video at all.
So if the ACLs don't allow someone to see a video, they won't be able to find it via search, even if it's "listed".
A video must be readable *and* listed to be found via search.

User pages can never be found via search.
Non-user content pages can always be found via search.

A series is considered "listed", if a series-block of that series exists on at least one non-user page.

A video is considered "listed", if *any* of the following blocks exists on at least one non-user page:
- a video-block of that video, or
- a series-block of that video's series, or
- a playlist-block of a playlist containing that video.


## Permissions in Tobira

There are a number of special roles that grant users the permission to perform certain actions in Tobira.
All these roles can be configured in `auth.roles`.

| Config | Permissions |
| ------ | ----------- |
| `roles.upload` | Can use Tobira's uploader |
| `roles.studio` | Can use Studio from Tobira |
| `roles.editor` | Can use the Editor from Tobira |
| `roles.user_realm` | Can create own user page |
| `roles.can_find_unlisted` | Can find unlisted items when editing page content |
| `roles.global_page_admin` | Is *page admin* on all non-user content-pages |
| `roles.global_page_moderator` | Is *page moderator* on all non-user content-pages |
| `roles.can_create_series` | Can create new series |
| `roles.can_create_playlists` | Can create new playlists |
| `roles.tobira_admin` | Is *Tobira admin* and can do all of the above |

All users can always see "My videos" and "My series".
If they do not have write access to any video/series they simply see an empty list and cannot do anything.

For content-pages, permissions can be given to users and groups via the UI.
Permissions are inherited down the page tree.
There are currently three permission levels:

| Name | Permissions |
| ---- | ----------- |
| *None* | Can only see the page, but not edit in any way |
| Page moderator | Can edit content, rename, change sub-page order and add new sub pages |
| Page admin | Can do everything: all page moderator permissions plus deleting the content-page, changing its path and changing page permissions |
