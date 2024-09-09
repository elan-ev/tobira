import { Trans, useTranslation } from "react-i18next";
import { graphql, PreloadedQuery, usePreloadedQuery, useQueryLoader } from "react-relay";
import {
    LuCalendarRange,
    LuLayout,
    LuLibrary,
    LuPlayCircle,
    LuRadio,
    LuVolume2,
    LuX,
} from "react-icons/lu";
import { LetterText } from "lucide-react";
import { IconType } from "react-icons";
import { ReactNode, RefObject, useEffect, useRef } from "react";
import {
    Button,
    Card,
    Floating,
    FloatingContainer,
    FloatingTrigger,
    ProtoButton,
    WithTooltip,
    match,
    screenWidthAtMost,
    unreachable,
    useColorScheme,
} from "@opencast/appkit";
import { CSSObject } from "@emotion/react";

import { RootLoader } from "../layout/Root";
import {
    ItemType as RawItemType,
    SearchQuery,
    SearchQuery$data,
} from "./__generated__/SearchQuery.graphql";
import { RouterControl, makeRoute } from "../rauta";
import { loadQuery } from "../relay";
import { Link, useRouter } from "../router";
import {
    Creators,
    Thumbnail,
    ThumbnailImg,
    ThumbnailOverlay,
    ThumbnailOverlayContainer,
    ThumbnailReplacement,
    formatDuration,
} from "../ui/Video";
import { SmallDescription } from "../ui/metadata";
import { Breadcrumbs, BreadcrumbsContainer, BreadcrumbSeparator } from "../ui/Breadcrumbs";
import { MissingRealmName } from "./util";
import { ellipsisOverflowCss, focusStyle } from "../ui";
import { COLORS } from "../color";
import { BREAKPOINT_MEDIUM, BREAKPOINT_SMALL } from "../GlobalStyle";
import { eventId, isExperimentalFlagSet, keyOfId, secondsToTimeString } from "../util";
import { DirectVideoRoute, VideoRoute } from "./Video";
import { DirectSeriesRoute } from "./Series";
import { PartOfSeriesLink } from "../ui/Blocks/VideoList";
import { SearchSlidePreviewQuery } from "./__generated__/SearchSlidePreviewQuery.graphql";


export const isSearchActive = (): boolean => document.location.pathname === "/~search";

type ItemType = Exclude<RawItemType, "%future added value">
type SearchParams = {
    query: string;
    itemType?: ItemType;
    start?: string;
    end?: string;
}

export const SearchRoute = makeRoute({
    url: ({ query, itemType, start, end }: SearchParams) => {
        const searchParams = new URLSearchParams({ q: query });

        if (itemType) {
            searchParams.append("f", itemType);
        }
        if (start) {
            searchParams.append("start", start);
        }
        if (end) {
            searchParams.append("end", end);
        }

        return `/~search?${searchParams}`;
    },
    match: url => {
        if (url.pathname !== "/~search") {
            return null;
        }

        const q = url.searchParams.get("q") ?? "";
        const filters = prepareFilters(url);

        const queryRef = loadQuery<SearchQuery>(query, { q, filters });

        return {
            render: () => <RootLoader
                {...{ query, queryRef }}
                noindex
                nav={() => []}
                render={data => <SearchPage {...{ q }} outcome={data.search} />}
            />,
            dispose: () => queryRef.dispose(),
        };
    },
});

const itemTypes: ItemType[] = ["EVENT", "REALM", "SERIES"];
export const isValidSearchItemType = (value: string | null | undefined) =>
    value && (itemTypes as string[]).includes(value)
        ? value as ItemType
        : undefined;
const prepareFilters = (url: URL) => {
    const parseTime = (timeString: string | null) => {
        const date = new Date(timeString + "T00:00:00Z");
        return !isNaN(date.getTime()) ? date.toISOString() : null;
    };
    const filters = {
        itemType: isValidSearchItemType(url.searchParams.get("f")),
        start: parseTime(url.searchParams.get("start")),
        end: parseTime(url.searchParams.get("end")),
    };

    return filters;
};

const query = graphql`
    query SearchQuery($q: String!, $filters: Filters! ) {
        ... UserData
        search(query: $q, filters: $filters) {
            __typename
            ... on EmptyQuery { dummy }
            ... on SearchUnavailable { dummy }
            ... on SearchResults {
                items {
                    id
                    __typename
                    ... on SearchEvent {
                        title
                        description
                        thumbnail
                        duration
                        creators
                        seriesTitle
                        seriesId
                        isLive
                        audioOnly
                        startTime
                        endTime
                        created
                        hostRealms { path }
                        textMatches {
                            start
                            duration
                            text
                            ty
                            highlights { start len }
                        }
                    }
                    ... on SearchSeries {
                        title
                        description
                        thumbnails { thumbnail isLive audioOnly }
                    }
                    ... on SearchRealm { name path ancestorNames }
                }
                totalHits
            }
        }
    }
`;

type Props = {
    q: string;
    outcome: SearchQuery$data["search"];
};

const SearchPage: React.FC<Props> = ({ q, outcome }) => {
    const { t } = useTranslation();
    const router = useRouter();

    useEffect(() => {
        const handleEscape = ((ev: KeyboardEvent) => {
            if (ev.key === "Escape") {
                handleNavigation(router);
            }
        });
        document.addEventListener("keyup", handleEscape);
        return () => document.removeEventListener("keyup", handleEscape);
    });

    let body;
    if (outcome.__typename === "EmptyQuery") {
        body = <CenteredNote>{t("search.too-few-characters")}</CenteredNote>;
    } else if (outcome.__typename === "SearchUnavailable") {
        body = <div css={{ textAlign: "center" }}>
            <Card kind="error">{t("search.unavailable")}</Card>
        </div>;
    } else if (outcome.__typename === "SearchResults") {
        body = outcome.items.length === 0
            ? <CenteredNote>{t("search.no-results")}</CenteredNote>
            : <SearchResults items={outcome.items} />;
    } else {
        return unreachable("unknown search outcome");
    }

    const hits = outcome.__typename === "SearchResults" ? outcome.totalHits : 0;

    return <>
        <Breadcrumbs path={[]} tail={q
            ? <Trans i18nKey={"search.title"} count={hits}>
                {{ query: q }}
            </Trans>
            : t("search.no-query")
        } />
        <div css={{ maxWidth: 900, margin: "0 auto" }}>
            {isExperimentalFlagSet() && <>
                {/* Filters */}
                <div>
                    <div css={{
                        display: "flex",
                        flexWrap: "wrap",
                        gap: 8,
                    }}>
                        {/* Type */}
                        <FilterButton {...{ router }} />
                        {itemTypes.map((type, index) =>
                            <FilterButton key={index} {...{ type, router }} />)
                        }
                        {/* Date */}
                        <DatePicker {...{ router }} />
                    </div>
                </div>
            </>}
            {/* Search results */}
            {body}
        </div>
    </>;
};

type DatePickerProps = {
    router: RouterControl;
}

const DatePicker: React.FC<DatePickerProps> = ({ router }) => {
    const { t } = useTranslation();
    const ref = useRef(null);
    const handleChange = (
        date: string,
        type: "start" | "end",
    ) => {
        const params = new URLSearchParams(window.location.search);
        const query = params.get("q") ?? "";
        const itemType = isValidSearchItemType(params.get("f")) ?? undefined;
        const start = type === "start"
            ? date
            : params.get("start") ?? "";
        const end = type === "end"
            ? date
            : params.get("end") ?? "";
        router.goto(SearchRoute.url({ query, itemType, start, end }), true);
    };

    const params = new URLSearchParams(window.location.search);
    const startDate = params.get("start");
    const endDate = params.get("end");

    const isActive = startDate || endDate;
    const inputStyle = {
        borderRadius: 4,
        border: `1px solid ${COLORS.neutral40}`,
        ...focusStyle({ width: 2, inset: true }),
    };

    return <FloatingContainer
        {...{ ref }}
        placement="top"
        arrowSize={12}
        ariaRole="dialog"
        trigger="click"
        viewPortMargin={12}
    >
        <FloatingTrigger>
            <Button aria-label={t("search.select-time-frame")} css={{
                height: 40,
                ...isActive && {
                    backgroundColor: COLORS.neutral30,
                    "&&": {
                        border: `1px solid ${COLORS.neutral90}`,
                    },
                },
            }}><LuCalendarRange /></Button>
        </FloatingTrigger>
        <Floating css={{ padding: "0 8px 8px 8px" }}>
            <p css={{ fontSize: 14, padding: "4px 2px" }}>{t("search.select-time-frame")}</p>
            <div css={{
                display: "flex",
                flexWrap: "wrap",
                gap: 8,
            }}>
                {isActive && <ProtoButton
                    aria-label={t("search.clear-time-frame")}
                    css={{ display: "flex", alignItems: "center" }}
                    onClick={() => {
                        handleChange("", "start");
                        handleChange("", "end");
                    }}
                ><LuX /></ProtoButton>}
                <input
                    value={startDate ?? ""}
                    css={inputStyle}
                    type="date"
                    onChange={e => handleChange(e.target.value, "start")}
                />
                <span>-</span>
                <input
                    value={endDate ?? ""}
                    css={inputStyle}
                    type="date"
                    min={startDate ?? ""}
                    onChange={e => handleChange(e.target.value, "end")}
                />
            </div>
        </Floating>
    </FloatingContainer>;
};

type FilterButtonProps = {
    type?: ItemType;
    router: RouterControl;
}

const FilterButton: React.FC<FilterButtonProps> = ({ type, router }) => {
    const { t } = useTranslation();
    const handleClick = () => {
        const params = new URLSearchParams(window.location.search);
        const query = params.get("q") ?? "";
        const start = params.get("start") ?? "";
        const end = params.get("end") ?? "";
        const itemType = type ?? undefined;
        router.goto(SearchRoute.url({ query, itemType, start, end }), true);
    };

    const params = new URLSearchParams(window.location.search);
    const filter = isValidSearchItemType(params.get("f"));
    const translationKey = type ? type.toLowerCase() as Lowercase<ItemType> : "all";

    return <Button
        onClick={handleClick}
        disabled={!filter && !type || filter === type}
        css={{
            width: "fit-content",
            justifyContent: "center",
            ":disabled": {
                backgroundColor: COLORS.neutral30,
                color: COLORS.neutral90,
                border: `1px solid ${COLORS.neutral90}`,
            },
        }}
    >{t(`search.filter.${translationKey}`)}</Button>;
};

const CenteredNote: React.FC<{ children: ReactNode }> = ({ children }) => (
    <div css={{ textAlign: "center" }}>
        <Card kind="info">{children}</Card>
    </div>
);

type Results = Extract<SearchQuery$data["search"], { __typename: "SearchResults" }>;

type SearchResultsProps = {
    items: Results["items"];
};

const unwrapUndefined = <T, >(value: T | undefined): T => typeof value === "undefined"
    ? unreachable("type dependent field for search item is not set")
    : value;

const SearchResults: React.FC<SearchResultsProps> = ({ items }) => (
    <ul css={{
        listStyle: "none",
        padding: 0,
        // A yellow that looks good for dark and light mode.
        "--highlight-color": "#ba9f14",
    }}>
        {items.map(item => {
            if (item.__typename === "SearchEvent") {
                return <SearchEvent key={item.id} {...{
                    id: item.id,
                    title: unwrapUndefined(item.title),
                    description: unwrapUndefined(item.description),
                    thumbnail: unwrapUndefined(item.thumbnail),
                    duration: unwrapUndefined(item.duration),
                    creators: unwrapUndefined(item.creators),
                    seriesTitle: unwrapUndefined(item.seriesTitle),
                    seriesId: unwrapUndefined(item.seriesId),
                    isLive: unwrapUndefined(item.isLive),
                    audioOnly: unwrapUndefined(item.audioOnly),
                    created: unwrapUndefined(item.created),
                    startTime: unwrapUndefined(item.startTime),
                    endTime: unwrapUndefined(item.endTime),
                    hostRealms: unwrapUndefined(item.hostRealms),
                    textMatches: unwrapUndefined(item.textMatches),
                }} />;
            } else if (item.__typename === "SearchSeries") {
                return <SearchSeries key={item.id} {...{
                    id: item.id,
                    title: unwrapUndefined(item.title),
                    description: unwrapUndefined(item.description),
                    thumbnails: unwrapUndefined(item.thumbnails),
                }} />;
            } else if (item.__typename === "SearchRealm") {
                return <SearchRealm key={item.id} {...{
                    id: item.id,
                    name: unwrapUndefined(item.name),
                    fullPath: unwrapUndefined(item.path),
                    ancestorNames: unwrapUndefined(item.ancestorNames),
                }} />;
            } else {
                // eslint-disable-next-line no-console
                console.warn("Unknown search item type: ", item.__typename);
                return null;
            }
        })}
    </ul>
);

type WithIconProps = React.PropsWithChildren<{
    Icon: IconType;
    iconSize?: number;
    hideIconOnMobile?: boolean;
}>;

const WithIcon: React.FC<WithIconProps> = ({ Icon, iconSize = 30, children, hideIconOnMobile }) => (
    <div css={{
        display: "flex",
        flexDirection: "row",
        flexGrow: "1",
        minWidth: 0,
        gap: 24,
        [screenWidthAtMost(BREAKPOINT_MEDIUM)]: {
            flexDirection: "row-reverse",
            justifyContent: "space-between",
            paddingLeft: 4,
        },
        ...hideIconOnMobile && {
            [screenWidthAtMost(BREAKPOINT_SMALL)]: {
                justifyContent: "flex-end",
            },
        },
    }}>
        <Icon size={iconSize} css={{
            flexShrink: 0,
            color: COLORS.primary0,
            strokeWidth: 1.5,
            ...hideIconOnMobile && {
                [screenWidthAtMost(BREAKPOINT_SMALL)]: {
                    display: "none",
                },
            },
        }} />
        {children}
    </div>
);

type SearchEventProps = {
    id: string;
    title: string;
    description: string | null;
    thumbnail: string | null;
    duration: number;
    creators: readonly string[];
    seriesTitle: string | null;
    seriesId: string | null;
    isLive: boolean;
    audioOnly: boolean;
    created: string;
    startTime: string | null;
    endTime: string | null;
    hostRealms: readonly { readonly path: string }[];
    textMatches: NonNullable<Results["items"][number]["textMatches"]>;
};

const SearchEvent: React.FC<SearchEventProps> = ({
    id,
    title,
    description,
    thumbnail,
    duration,
    creators,
    seriesTitle,
    seriesId,
    isLive,
    audioOnly,
    created,
    startTime,
    endTime,
    hostRealms,
    textMatches,
}) => {
    // TODO: decide what to do in the case of more than two host realms. Direct
    // link should be avoided.
    const link = hostRealms.length !== 1
        ? DirectVideoRoute.url({ videoId: id })
        : VideoRoute.url({ realmPath: hostRealms[0].path, videoID: id });

    return (
        <Item key={id} link={link}>
            <WithIcon Icon={LuPlayCircle} hideIconOnMobile>
                <div css={{
                    color: COLORS.neutral90,
                    marginRight: "clamp(12px, 4vw - 13px, 40px)",
                    display: "flex",
                    flexDirection: "column",
                    minWidth: 0,
                    width: "100%",
                }}>
                    <h3 css={{
                        color: COLORS.primary0,
                        marginBottom: 6,
                        fontSize: 17,
                        lineHeight: 1.3,
                        ...ellipsisOverflowCss(2),
                    }}>{title}</h3>
                    <Creators creators={creators} css={{
                        ul: {
                            display: "inline-block",
                            overflow: "hidden",
                            textOverflow: "ellipsis",
                            whiteSpace: "nowrap",
                        },
                        li: {
                            display: "inline",
                        },
                    }} />
                    {description && <SmallDescription
                        text={description}
                        lines={3}
                    />}
                    {seriesTitle && seriesId && <PartOfSeriesLink {...{ seriesTitle, seriesId }} />}

                    {/* Show timeline with matches if there are any */}
                    {textMatches.length > 0 && (
                        <TextMatchTimeline {...{ id, duration, link, textMatches }} />
                    )}
                </div>
            </WithIcon>
            <Link to={link}>
                <Thumbnail
                    event={{
                        title,
                        isLive,
                        created,
                        syncedData: {
                            thumbnail,
                            duration,
                            startTime,
                            endTime,
                            audioOnly,
                        },
                    }}
                    css={thumbnailCss}
                />
            </Link>
        </Item>
    );
};

const thumbnailCss = {
    outline: `1px solid ${COLORS.neutral15}`,
    minWidth: 270,
    width: 270,
    marginLeft: "auto",
    [screenWidthAtMost(800)]: {
        minWidth: 240,
        width: 240,
    },
    [screenWidthAtMost(BREAKPOINT_MEDIUM)]: {
        maxWidth: 400,
        margin: "0 auto",
    },
};

type TextMatchTimelineProps = Pick<SearchEventProps, "id" | "duration" | "textMatches"> & {
    link: string;
};

const slidePreviewQuery = graphql`
    query SearchSlidePreviewQuery($id: ID!) {
        eventById(id: $id) {
            ...on AuthorizedEvent {
                id
                syncedData {
                    segments { startTime uri }
                }
            }
        }
    }
`;

const TextMatchTimeline: React.FC<TextMatchTimelineProps> = ({
    id, duration, textMatches, link,
}) => {
    const sectionLink = (startMs: number) => `${link}?t=${secondsToTimeString(startMs / 1000)}`;
    const [queryRef, loadQuery]
        = useQueryLoader<SearchSlidePreviewQuery>(slidePreviewQuery);

    // We load the query once the user hovers over the parent container. This
    // seems like it would send a query every time the mouse enters, but relay
    // caches the results, so it is only sent once.
    return (
        <div onMouseEnter={() => { loadQuery({ id: eventId(keyOfId(id)) }); }} css={{
            width: "100%",
            position: "relative",
            height: 10.5,
            margin: "16px 0",
            border: `1.5px solid ${COLORS.neutral50}`,
            borderTop: "none",
            borderBottom: "none",
        }}>
            {/* The timeline line */}
            <div css={{
                position: "absolute",
                left: 0,
                right: 0,
                bottom: "calc(50% - 0.75px)",
                height: 0,
                borderTop: `1.5px solid ${COLORS.neutral50}`,
            }} />

            {textMatches.map((m, i) => (
                <WithTooltip
                    key={i}
                    distance={m.ty === "CAPTION" ? 4 : 5.5}
                    tooltipCss={{
                        textAlign: "center",
                        paddingTop: 8,
                        minWidth: 160,
                        maxWidth: "min(85vw, 420px)",
                    }}
                    tooltip={queryRef
                        ? <TextMatchTooltipWithMaybeImage queryRef={queryRef} textMatch={m} />
                        : <TextMatchTooltip textMatch={m} />
                    }
                    css={{
                        position: "absolute",
                        ...match(m.ty, {
                            CAPTION: () => ({
                                height: "100%",
                                bottom: "0",
                                backgroundColor: COLORS.primary1,
                            }) as CSSObject,
                            SLIDE_TEXT: () => ({
                                height: "70%",
                                bottom: "15%",
                                backgroundColor: COLORS.primary0,
                            }),
                            "%future added value": () => unreachable(),
                        }),
                        width: `calc(${m.duration / duration * 100}% - 1px)`,
                        minWidth: 6, // To make the sections not too small to click
                        left: `${m.start / duration * 100}%`,
                        borderRadius: 1,
                        "&:hover": {
                            backgroundColor: COLORS.primary2,
                        },
                    }}
                >
                    <Link
                        to={sectionLink(m.start)}
                        css={{ display: "block", height: "100%" }}
                    />
                </WithTooltip>
            ))}
        </div>
    );
};

type TextMatchTooltipWithMaybeImageProps = {
    queryRef: PreloadedQuery<SearchSlidePreviewQuery>;
    textMatch: SearchEventProps["textMatches"][number];
};

const TextMatchTooltipWithMaybeImage: React.FC<TextMatchTooltipWithMaybeImageProps> = ({
    queryRef,
    textMatch,
}) => {
    const data = usePreloadedQuery(slidePreviewQuery, queryRef);
    const segments = data.eventById?.syncedData?.segments ?? [];

    // Find the segment with its start time closest to the `start` of the text
    // match, while still being smaller.
    let currBestDiff = Infinity;
    let currBest = undefined;
    for (const segment of segments) {
        // Relax the comparison a bit to be able to deal with rounding errors
        // somewhere in the pipeline. Note that we still use the closest and
        // segments are usually fairly long, so this is unlikely to result in
        // any negative effects.
        if (segment.startTime <= textMatch.start + 500) {
            const diff = textMatch.start - segment.startTime;
            if (diff < currBestDiff) {
                currBestDiff = diff;
                currBest = segment;
            }
        }
    }

    return <TextMatchTooltip previewImage={currBest?.uri} textMatch={textMatch} />;
};

type TextMatchTooltipProps = {
    previewImage?: string;
    textMatch: SearchEventProps["textMatches"][number];
};

const TextMatchTooltip: React.FC<TextMatchTooltipProps> = ({ previewImage, textMatch }) => {
    const startDuration = formatDuration(textMatch.start);
    const endDuration = formatDuration(textMatch.start + textMatch.duration);

    return <>
        {/* Icon to show what kind of textMatch this is */}
        <div css={{
            position: "absolute",
            fontSize: 20,
            lineHeight: 1,
            opacity: 0.2,
            bottom: 0,
            left: 4,
        }}>
            {match(textMatch.ty, {
                CAPTION: () => <LuVolume2 />,
                SLIDE_TEXT: () => <LetterText />,
                "%future added value": unreachable,
            })}
        </div>

        {previewImage && (
            <img src={previewImage} css={{
                maxWidth: "100%",
                height: 160,
                borderRadius: 4,
            }}/>
        )}
        <div css={{
            height: previewImage ? 38 : "auto",
            display: "flex",
            alignItems: "center",
            justifyContent: "center",
        }}>
            <div css={{
                padding: 1,
                fontSize: 13,
                lineHeight: 1.3,
                ...ellipsisOverflowCss(2),
                mark: highlightCss(COLORS.neutral90, COLORS.neutral15),
            }}>
                …{highlightText(textMatch.text, textMatch.highlights)}…
            </div>
        </div>
        <div css={{ marginTop: 2 }}>
            {`(${startDuration} – ${endDuration})`}
        </div>
    </>;
};


type ThumbnailInfo = {
    readonly audioOnly: boolean;
    readonly isLive: boolean;
    readonly thumbnail: string | null | undefined;
}
type SearchSeriesProps = {
    id: string;
    title: string;
    description: string | null;
    thumbnails: readonly ThumbnailInfo[] | undefined;
}

const SearchSeries: React.FC<SearchSeriesProps> = ({ id, title, description, thumbnails }) =>
    <Item key={id} link={DirectSeriesRoute.url({ seriesId: id })}>
        <WithIcon Icon={LuLibrary} iconSize={28} hideIconOnMobile>
            <div css={{
                color: COLORS.neutral90,
                marginRight: "clamp(12px, 4vw - 13px, 40px)",
                display: "flex",
                flexDirection: "column",
                minWidth: 0,
            }}>
                <h3 css={{
                    color: COLORS.primary0,
                    marginBottom: 6,
                    fontSize: 17,
                    lineHeight: 1.3,
                    ...ellipsisOverflowCss(2),
                }}>{title}</h3>
                {description && <SmallDescription
                    text={description}
                    lines={3}
                />}
            </div>
        </WithIcon>
        <Link to={DirectSeriesRoute.url({ seriesId: id })}>
            <ThumbnailStack {...{ thumbnails, title }} />
        </Link>
    </Item>
;

type ThumbnailStackProps = Pick<SearchSeriesProps, "title" | "thumbnails">

const ThumbnailStack: React.FC<ThumbnailStackProps> = ({ thumbnails, title }) => (
    <div css={{
        ...thumbnailCss,
        outline: 0,
        display: "grid",
        gridAutoColumns: "1fr",
        "> div": {
            outline: `1px solid ${COLORS.neutral10}`,
            borderRadius: 8,
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
        {thumbnails?.map((info, idx) => <div key={idx}>
            <SeriesThumbnail {...{ info, title }} />
        </div>)}
    </div>
);

type SeriesThumbnailProps = {
    info: ThumbnailInfo;
    title: string;
}

const SeriesThumbnail: React.FC<SeriesThumbnailProps> = ({ info, title }) => {
    const { t } = useTranslation();
    const isDark = useColorScheme().scheme === "dark";

    let inner;
    if (info.thumbnail != null) {
        // We have a proper thumbnail.
        inner = <ThumbnailImg
            src={info.thumbnail}
            alt={t("series.entry-of-series-thumbnail", { series: title })}
        />;
    } else {
        inner = <ThumbnailReplacement audioOnly={info.audioOnly} {...{ isDark }} />;
    }

    const overlay = <ThumbnailOverlay backgroundColor="rgba(200, 0, 0, 0.9)">
        <LuRadio css={{ fontSize: 19, strokeWidth: 1.4 }} />
        {t("video.live")}
    </ThumbnailOverlay>;

    return <ThumbnailOverlayContainer>
        {inner}
        {info.isLive && overlay}
    </ThumbnailOverlayContainer>;
};

type SearchRealmProps = {
    id: string;
    name: string | null;
    ancestorNames: readonly (string | null | undefined)[];
    fullPath: string;
};

const SearchRealm: React.FC<SearchRealmProps> = ({ id, name, ancestorNames, fullPath }) => (
    <Item key={id} link={fullPath}>
        <WithIcon Icon={LuLayout}>
            <div>
                <BreadcrumbsContainer>
                    {ancestorNames.map((name, i) => <li key={i}>
                        {name ?? <MissingRealmName />}
                        <BreadcrumbSeparator />
                    </li>)}
                </BreadcrumbsContainer>
                <h3 css={{ color: COLORS.primary0 }}>{name ?? <MissingRealmName />}</h3>
            </div>
        </WithIcon>
    </Item>
);

type ItemProps = {
    link: string;
    children: ReactNode;
};

const Item: React.FC<ItemProps> = ({ link, children }) => (
    <li css={{
        position: "relative",
        display: "flex",
        borderRadius: 16,
        border: `1px solid ${COLORS.neutral15}`,
        margin: 16,
        padding: 8,
        gap: 8,
        textDecoration: "none",
        "&:hover, &:focus": {
            backgroundColor: COLORS.neutral10,
        },
        [screenWidthAtMost(BREAKPOINT_MEDIUM)]: {
            flexDirection: "column-reverse",
            gap: 12,
            margin: "16px 0",
            "& > *:last-child": {
                width: "100%",
            },
        },
    }}>
        <Link to={link} css={{
            position: "absolute",
            inset: 0,
            borderRadius: 16,
        }}/>
        {children}
    </li>
);

// If a user initiated the search in Tobira (i.e. neither coming from an
// external link nor using the browser bar to manually visit the /~search route),
// we can redirect to the previous page. Otherwise we redirect to Tobira's homepage.
export const handleNavigation = ((router: RouterControl, ref?: RefObject<HTMLInputElement>) => {
    if (ref?.current) {
        // Why is this necessary? When a user reloads the search page and then navigates
        // away within Tobira, the search input isn't cleared like it would be usually.
        // So it needs to be done manually.
        ref.current.value = "";
    }
    if (router.internalOrigin) {
        window.history.back();
    } else {
        router.goto("/");
    }
});

/**
 * Slices a string with byte indices. Never cuts into UTF-8 chars, but
 * arbitrarily decides in what output to place them.
 */
const byteSlice = (s: string, start: number, len: number): readonly [string, string, string] => {
    const isCharBoundary = (b: Uint8Array, idx: number): boolean => {
        if (idx === 0 || idx === b.byteLength) {
            return true;
        }
        const v = b.at(idx);
        if (v === undefined) {
            return false;
        }

        // UTF-8 chars have either the first bit 0 or the first two bits 1.
        return v < 0x80 || v >= 0xC0;
    };

    const bytes = new TextEncoder().encode(s);
    const decoder = new TextDecoder("utf-8");

    // Round indices to avoid cutting into UTF8 chars. The loop only needs to
    // execute 3 times as every 4 bytes there is always a char boundary.
    let end = start + len;
    for (let i = 0; i < 3; i += 1) {
        if (!isCharBoundary(bytes, start)) {
            start += 1;
        }
        if (!isCharBoundary(bytes, end)) {
            end += 1;
        }
    }

    return [
        decoder.decode(bytes.slice(0, start)),
        decoder.decode(bytes.slice(start, end)),
        decoder.decode(bytes.slice(end)),
    ] as const;
};

const highlightText = (
    s: string,
    spans: readonly { start: number; len: number }[],
) => {
    const textParts = [];
    let remainingText = s;
    let offset = 0;
    for (const span of spans) {
        const highlightStart = span.start - offset;
        const [prefix, middle, rest]
            = byteSlice(remainingText, highlightStart, span.len);

        textParts.push(<span key={offset + 1}>{prefix}</span>);
        textParts.push(
            <mark key={offset}>{middle}</mark>
        );
        remainingText = rest;
        offset = span.start + span.len;
    }
    textParts.push(remainingText);
    return textParts;
};

const highlightCss = (color: string, backgroundColor: string) => ({
    color,
    backgroundColor,
    borderBottom: "2px solid var(--highlight-color)",
    borderRadius: 2,
});
