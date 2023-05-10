---
sidebar_position: 5
---

# Theme: Logo & Colors

This document will explain how to best adjust the `[theme]` configuration.
If you have no experience in UI design and are not familiar with your organization's CI, you usually want to talk to such a person and do this part of the configuration together.


## Logo & Header height

The logo image file (SVG recommended) has to contain all required margin.
Tobira does not add any space around the logo at all.
There might be space to the right or left, depending on the screen size, but do not count on it!
In the following image, the logo file has a pink background color to show you its size and the margin included in it.

![](../img/logo-margin.png)

Once the logo file is created and configured, adjust `header_height` to your liking.
This is the height of the header (and thus also your logo) in pixels.
Only the logo is stretched, all other elements are vertically centered within the header.

You can also configure a second logo file as `logo.small` which is used for narrow screens (e.g. phones).
This is usually roughly square.
We strongly recommend setting this smaller logo, as otherwise, the main logo (especially if it is very wide) might get shrunk on narrow screens in order to still show the other elements in the header.


## Favicon

The favicon is a single SVG file, that's usually a simplified version of your logo.
It is shown as tiny image in browser tabs, the browser's history or a bookmark list.


## Colors

All colors throughout Tobira's UI are derived from a small set of base colors.
These allow you to change the appearence of Tobira to be closer to your organization's CI.

- **Primary**: Main color that's used for almost everything that's *colored* (i.e. not grey).
- **Danger**: Used for potentially destructive/dangerous actions and error messages. Should be red.
- **Grey** (optional): Base color for all grey tones used. This is only useful if you want a slightly colored grey. This is fully grey (0 saturation) by default.
- **Happy** (optional): Used for call-to-action elements and things associated with something positive. Is equal to the primary color by default and should only be overwritten if your primary color is red, as using red for these elements would lead to user confusion.

Tobira automatically creates variations of these base colors, each having a different *perceived brightness*.
For *grey*, many different variations are created, each with a fixed perceived brightness, some very dark, some very bright.
For the other colors, only a couple darker variations are created.

The perceived brightness of your configured base colors should fall into a range, in order for the UI to have enough contrast to be accessible to those with limited vision.
The allowed perceived brightness ranges:
- Primary: 35% – 46.5%
- Danger: 23% – 46.5%
- Happy: ≥ 35%

You can use [this LCH color picker](https://lch.oklch.com/) to adjust or pick a color.
The "lightness" in there represents the perceived brightness.
So you likely want to paste your organization's CI color into there, check if the lightness is fine and if not, adjust it to be in this range.



### Extra & background information

#### What is perceived brightness?

This term describes how bright a specific color is perceived as by a human with standard vision.
This is non-linear with respect to the light energy (number of photons) and also depends on the colors present in the light, as some colors are percieved as brighter (e.g. green) than others (e.g. blue).

#### How color variations are created

The variations are created by converting the base colors into the LCH color space and then adjusting the `l` channel.
LCH is a perceptually uniform color space and the `l` channel represents the *perceived brightness* (unlike the `l` channel in HSL!).
Changing `l` will only change the perceived brightness, keeping the saturation and hue the same.
The perceived brightness difference between the variations also does not depend on its hue, saturation, or the configured brightness of the base color.
All this is done to get consistent contrast levels between different colors.

