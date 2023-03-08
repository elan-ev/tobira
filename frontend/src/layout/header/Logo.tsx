import { useTranslation } from "react-i18next";
import CONFIG from "../../config";
import { BREAKPOINT_SMALL } from "../../GlobalStyle";
import { Link } from "../../router";
import { focusStyle } from "../../ui";
import { WithTooltip } from "../../ui/Floating";
import { translatedConfig } from "../../util";
import { HEADER_BASE_PADDING } from "./ui";


export const Logo: React.FC = () => {
    const { t, i18n } = useTranslation();

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

    const small = CONFIG.logo.small;
    const large = CONFIG.logo.large;

    const alt = t("general.logo-alt", { title: translatedConfig(CONFIG.siteTitle, i18n) });

    return (
        <WithTooltip
            tooltip={t("general.goto-homepage")}
            placement="right"
            distance={-8}
            css={{
                height: `calc(100% + ${HEADER_BASE_PADDING * 2}px)`,
                flex: "0 1 auto",
                margin: `-${HEADER_BASE_PADDING}px 0`,
            }}
        >
            <Link to="/" css={{
                ":hover": { outlineOffset: -2, outline: "2px solid var(--grey80)" },
                display: "block",
                height: "100%",
                borderRadius: 4,
                ...focusStyle({ inset: true }),
                "& > img": {
                    height: "100%",
                    width: "auto",
                    maxWidth: "100%",
                },
            }}>
                <img
                    width={large.resolution[0]}
                    height={large.resolution[1]}
                    src={large.path}
                    alt={alt}
                    css={{
                        [`@media (max-width: ${BREAKPOINT_SMALL}px)`]: {
                            display: "none",
                        },
                    }}
                />
                <img
                    width={small.resolution[0]}
                    height={small.resolution[1]}
                    src={small.path}
                    alt={alt}
                    css={{
                        [`@media not all and (max-width: ${BREAKPOINT_SMALL}px)`]: {
                            display: "none",
                        },
                    }}
                />
            </Link>
        </WithTooltip>
    );
};
