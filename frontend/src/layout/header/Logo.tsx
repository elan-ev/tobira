import { useTranslation } from "react-i18next";
import { screenWidthAbove, screenWidthAtMost } from "@opencast/appkit";

import CONFIG from "../../config";
import { BREAKPOINT_SMALL } from "../../GlobalStyle";
import { Link } from "../../router";
import { focusStyle } from "../../ui";
import { translatedConfig, useLogoConfig } from "../../util";
import { HEADER_BASE_PADDING } from "./ui";
import { COLORS } from "../../color";


export const Logo: React.FC = () => {
    const { t, i18n } = useTranslation();
    const logos = useLogoConfig();

    const alt = t("general.logo-alt", { title: translatedConfig(CONFIG.siteTitle, i18n) });

    // This is a bit tricky: we want to specify the `width` and `height`
    // attributes on the `img` elements in order to avoid layout shift. That
    // already rules out the `<picture>` element since that assumes all sources
    // have the same aspect ratio.
    //
    // The resolutions of the logos is specified in the config. However, to
    // faithfully represent the aspect ratio of the images with an integer
    // resolution, large numbers might be required. But setting the `width` to
    // a large number means the `<img>` will take that space in pixels. But
    // that's often too large. Easy fix: `width: auto` since we already have
    // `height: 100%`. However, we also need `max-width: 100%` so that the logo
    // shrinks on very small screens. But using that makes the logo not take up
    // the correct width when still being loaded: the parent `<a>` shrinks as
    // much as possible, making the `max-width: 100%` also shrink the image.
    //
    // The solution is to calculate the correct `flex-basis` for the `<a>`
    // element manually.

    return (
        <Link to="/" css={{
            height: `calc(100% + ${HEADER_BASE_PADDING * 2}px)`,
            flex: "0 1 auto",
            margin: `-${HEADER_BASE_PADDING}px 0`,
            ":hover": { outlineOffset: -4, outline: `2px solid ${COLORS.neutral25}` },
            display: "block",
            borderRadius: 8,
            ...focusStyle({ offset: -4 }),
            "& > img": {
                height: "100%",
                width: "auto",
                maxWidth: "100%",
            },
        }}>
            <img
                width={logos.wide.resolution[0]}
                height={logos.wide.resolution[1]}
                src={logos.wide.path}
                alt={alt}
                css={{
                    [screenWidthAtMost(BREAKPOINT_SMALL)]: {
                        display: "none",
                    },
                }}
            />
            <img
                width={logos.narrow.resolution[0]}
                height={logos.narrow.resolution[1]}
                src={logos.narrow.path}
                alt={alt}
                css={{
                    [screenWidthAbove(BREAKPOINT_SMALL)]: {
                        display: "none",
                    },
                }}
            />
        </Link>
    );
};
