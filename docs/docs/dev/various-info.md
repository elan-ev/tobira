---
sidebar_position: 6
---

# Info, Tips & Tricks

Various useful information for coding on Tobira.


## Experimental features

Some features in Tobira might not be finished yet but already included in the released versions.
These are disabled by default but can be enabled by adding an entry in your local storage (for the domain Tobira is running on):

| `tobiraExperimentalFeatures` | `true` |
| --- | --- |

Currently, there are no experimental features.


## Using colors in the frontend

All colors you specify in your CSS (even black and white) should not be hardcoded, but instead come from the `COLORS` constant defined in `color.tsx`.
How to pick a color:

- When coloring something that has to do with focus (e.g. an outline), use `focus`.
- For errors or potentially destructive actions, use the `danger*` colors.
- For call-to-action elements and elements with positive connotation, use the `happy*` colors.
  Of course, `happy` is often the same as `primary`, but you should still specify `happy`, pretending they are different.
- For all other things that should be colored (i.e. not grey), use `primary*`
- For all greys, well, use `grey*`.

Each color has a number, with smaller numbers being brighter, larger number being darker.
For `primary`, `danger` and `happy`, try to always use the `0` variant first.
The `*BwInverted` fields are either black or white, depending on what has the greater contrast to the specified color.

Check for sufficient contrast!

- `primary0` or `danger0` text should be only used on top of `background`, `grey00` and `grey10`, and not on anything darker.
- `happy*` colors currently have no enforced max brightness so shouldn't be used as text color at all.
  (If there is a good reason to use it as text color, we will have to see...)
