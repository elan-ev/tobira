import { useTranslation } from "react-i18next";
import { LuRadio } from "react-icons/lu";
import { useColorScheme } from "@opencast/appkit";

import {
    ThumbnailImg,
    ThumbnailOverlay,
    ThumbnailOverlayContainer,
    ThumbnailReplacement,
} from "./Video";
import { COLORS } from "../color";


type ThumbnailStackProps = {
    title: string;
    thumbnails: readonly ThumbnailInfo[];
    className?: string;
}

export const ThumbnailStack: React.FC<ThumbnailStackProps> = ({
    thumbnails,
    title,
    className,
}) => {
    const isDarkScheme = useColorScheme().scheme === "dark";

    return (
        <div {...{ className }} css={{
            position: "relative",
            zIndex: 0,
            margin: "0 auto",
            width: "70%",
            display: "grid",
            gridAutoColumns: "1fr",
            "> div": {
                position: "relative",
                borderRadius: 8,
                // The outline needs to be in a pseudo element as otherwise, it is
                // hidden behind the img for some reason.
                "::after": {
                    content: "''",
                    position: "absolute",
                    inset: 0,
                    borderRadius: 8,
                    outline: `2px solid ${COLORS.neutral70}`,
                    outlineOffset: -2,
                },
            },
            "> div:not(:last-child)": {
                boxShadow: "3px -2px 6px rgba(0, 0, 0, 40%)",
            },
            "> div:nth-child(1)": {
                zIndex: 3,
                gridColumn: "1 / span 10",
                gridRow: "3 / span 10",
            },
            "> div:nth-child(2)": {
                zIndex: 2,
                gridColumn: "2 / span 10",
                gridRow: "2 / span 10",
            },
            "> div:nth-child(3)": {
                zIndex: 1,
                gridColumn: "3 / span 10",
                gridRow: "1 / span 10",
            },
        }}>
            {thumbnails.slice(0, 3).map((info, idx) => <div key={idx}>
                <SeriesThumbnail {...{ info, title }} />
            </div>)}
            {/* Add fake thumbnails to always have 3. The visual image of 3 things behind each other
                is more important than actually showing the correct number of thumbnails. */}
            {[...Array(Math.max(0, 3 - thumbnails.length))].map((_, idx) => (
                <div key={"dummy" + idx}>
                    <DummySeriesStackThumbnail {...{ isDarkScheme }} />
                </div>
            ))}
        </div>
    );
};


const DummySeriesStackThumbnail: React.FC<{ isDarkScheme: boolean }> = ({
    isDarkScheme,
}) => <ThumbnailOverlayContainer css={{
    // Pattern from https://css-pattern.com/overlapping-cubes/,
    // MIT licensed: https://github.com/Afif13/CSS-Pattern
    "--s": "40px",
    ...isDarkScheme ? {
        "--c1": "#2c2c2c",
        "--c2": "#292929",
        "--c3": "#262626",
    } : {
        "--c1": "#e8e8e8",
        "--c2": "#e3e3e3",
        "--c3": "#dddddd",
    },

    "--_g": "0 120deg,#0000 0",
    background: `
        conic-gradient(             at calc(250%/3) calc(100%/3),
            var(--c3) var(--_g)),
        conic-gradient(from -120deg at calc( 50%/3) calc(100%/3),
            var(--c2) var(--_g)),
        conic-gradient(from  120deg at calc(100%/3) calc(250%/3),
            var(--c1) var(--_g)),
        conic-gradient(from  120deg at calc(200%/3) calc(250%/3),
            var(--c1) var(--_g)),
        conic-gradient(from -180deg at calc(100%/3) 50%,
            var(--c2)  60deg,var(--c1) var(--_g)),
        conic-gradient(from   60deg at calc(200%/3) 50%,
            var(--c1)  60deg,var(--c3) var(--_g)),
        conic-gradient(from  -60deg at 50% calc(100%/3),
            var(--c1) 120deg,var(--c2) 0 240deg,var(--c3) 0)
    `,
    backgroundSize: "calc(var(--s)*sqrt(3)) var(--s)",
}} />;

type ThumbnailInfo = {
    readonly audioOnly: boolean;
    readonly live: boolean;
    readonly url: string | null | undefined;
}

type SeriesThumbnailProps = {
    info: ThumbnailInfo;
    title: string;
}

const SeriesThumbnail: React.FC<SeriesThumbnailProps> = ({ info, title }) => {
    const { t } = useTranslation();
    const isDark = useColorScheme().scheme === "dark";

    let inner;
    if (info.url != null) {
        // We have a proper thumbnail.
        inner = <ThumbnailImg
            src={info.url}
            alt={t("series.entry-of-series-thumbnail", { series: title })}
        />;
    } else {
        inner = <ThumbnailReplacement
            audioOnly={info.audioOnly}
            videoState={null}
            {...{ isDark }}
        />;
    }

    const overlay = <ThumbnailOverlay backgroundColor="rgba(200, 0, 0, 0.9)">
        <LuRadio css={{ fontSize: 19, strokeWidth: 1.4 }} />
        {t("video.live")}
    </ThumbnailOverlay>;

    return <ThumbnailOverlayContainer>
        {inner}
        {info.live && overlay}
    </ThumbnailOverlayContainer>;
};
