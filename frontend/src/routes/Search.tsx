import { Trans, useTranslation } from "react-i18next";
import { graphql, PreloadedQuery, usePreloadedQuery, useQueryLoader } from "react-relay";
import {
    LuCalendar,
    LuCalendarRange,
    LuLayout,
    LuRadio,
    LuVolume2,
    LuX,
} from "react-icons/lu";
import { LetterText } from "lucide-react";
import {
    ReactNode,
    startTransition,
    Suspense,
    useCallback,
    useEffect,
    useRef,
    useState,
} from "react";
import {
    Button,
    Card,
    Floating,
    FloatingContainer,
    FloatingTrigger,
    ProtoButton,
    Spinner,
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
import { BREAKPOINT_MEDIUM } from "../GlobalStyle";
import {
    eventId,
    isExperimentalFlagSet,
    keyOfId,
    secondsToTimeString,
} from "../util";
import { DirectVideoRoute, VideoRoute } from "./Video";
import { DirectSeriesRoute, SeriesRoute } from "./Series";
import { PartOfSeriesLink } from "../ui/Blocks/VideoList";
import { SearchSlidePreviewQuery } from "./__generated__/SearchSlidePreviewQuery.graphql";
import { RelativeDate } from "../ui/time";


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

        if (!(q in SEARCH_TIMINGS)) {
            SEARCH_TIMINGS[q] = {};
        }
        SEARCH_TIMINGS[q].routeMatch = window.performance.now();

        const filters = prepareFilters(url);
        const queryRef = loadQuery<SearchQuery>(query, { q, filters });

        return {
            render: () => <RootLoader
                {...{ query, queryRef }}
                noindex
                nav={() => []}
                render={data => {
                    SEARCH_TIMINGS[q].queryReturned = window.performance.now();
                    return <SearchPage {...{ q }} outcome={data.search} />;
                }}
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
                    __typename
                    ... on SearchEvent {
                        id
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
                        hostRealms { path ancestorNames }
                        textMatches {
                            start
                            duration
                            text
                            ty
                            highlights
                        }
                        matches {
                            title
                            description
                            seriesTitle
                            creators { index span }
                        }
                    }
                    ... on SearchSeries {
                        id
                        title
                        description
                        thumbnails { thumbnail isLive audioOnly }
                        hostRealms { path ancestorNames }
                        matches { title description }
                    }
                    ... on SearchRealm {
                        id
                        name
                        path
                        ancestorNames
                        matches { name }
                    }
                }
                totalHits
                duration
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
        if (!isExperimentalFlagSet() || LAST_PRINTED_TIMINGS_QUERY === q) {
            return;
        }

        const info = SEARCH_TIMINGS[q];
        info.rendered = window.performance.now();
        const diff = (a?: number, b?: number) => !a || !b ? null : Math.round(b - a);
        // eslint-disable-next-line no-console
        console.table([{
            q: q,
            routing: diff(info.startSearch, info.routeMatch),
            query: diff(info.routeMatch, info.queryReturned),
            backend: outcome.__typename === "SearchResults" ? outcome.duration : null,
            render: diff(info.queryReturned, info.rendered),
        }]);
        LAST_PRINTED_TIMINGS_QUERY = q;
    });


    let body;
    if (outcome.__typename === "EmptyQuery") {
        body = <CenteredNote>{t("search.too-few-characters")}</CenteredNote>;
    } else if (outcome.__typename === "SearchUnavailable") {
        body = <div css={{ textAlign: "center" }}>
            <Card kind="error" css={{ margin: 32 }}>{t("search.unavailable")}</Card>
        </div>;
    } else if (outcome.__typename === "SearchResults") {
        body = outcome.items.length === 0
            ? <CenteredNote>{t("search.no-results")}</CenteredNote>
            : <SearchResults items={outcome.items} />;
    } else {
        return unreachable("unknown search outcome");
    }

    const hits = outcome.__typename === "SearchResults" ? outcome.totalHits : 0;
    const timingInfo = isExperimentalFlagSet() && outcome.__typename === "SearchResults"
        ? <>{` • ${outcome.duration}ms`}</>
        : null;

    return <>
        <Breadcrumbs path={[]} tail={q
            ? <>
                <Trans i18nKey={"search.title"} count={hits}>
                    {{ query: q }}
                </Trans>
                {timingInfo}
            </>
            : t("search.no-query")
        } />
        <div css={{ maxWidth: 1000, margin: "0 auto" }}>
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
type Item = Results["items"][number];
type EventItem = Omit<Extract<Item, { "__typename": "SearchEvent" }>, "__typename">;
type SeriesItem = Omit<Extract<Item, { "__typename": "SearchSeries" }>, "__typename">;
type RealmItem = Omit<Extract<Item, { "__typename": "SearchRealm" }>, "__typename">;

type SearchResultsProps = {
    items: Results["items"];
};

const SearchResults: React.FC<SearchResultsProps> = ({ items }) => {
    // Make search results navigatable by arrow keys. For this we don't use any
    // react state, but DOM methods directly. This is way easier in this case
    // to properly deal with changing focus due to use of the tab-key for
    // example. Using tab and arrow keys in hybrid works with this approach.
    // For this to work we add marker class names to two nodes below.
    useEffect(() => {
        const focus = (e: Element | null) => {
            const a = e?.querySelector("a.search-result-item-overlay-link");
            if (a && a instanceof HTMLElement) {
                a.focus();
            }
        };

        const handler = (e: KeyboardEvent) => {
            let dir: "up" | "down";
            if (e.key === "ArrowDown") {
                dir = "down";
            } else if (e.key === "ArrowUp") {
                dir = "up";
            } else {
                return;
            }

            e.preventDefault();

            const selected = document.querySelector(".search-result-item:focus-within");
            if (selected == null) {
                if (dir === "down") {
                    focus(document.querySelector(".search-result-item"));
                }
            } else {
                focus(selected[match(dir, {
                    down: () => "nextElementSibling" as const,
                    up: () => "previousElementSibling" as const,
                })]);
            }
        };
        document.addEventListener("keydown", handler);
        return () => document.removeEventListener("keydown", handler);
    });

    return (
        <ul css={{
            listStyle: "none",
            padding: 0,
            // A warm grey for highlighting matches.
            "--highlight-color": useColorScheme().scheme === "dark"
                ? COLORS.neutral25
                : COLORS.neutral20,
        }}>
            {items.map(item => {
                if (item.__typename === "SearchEvent") {
                    return <SearchEvent key={item.id} {...item} />;
                } else if (item.__typename === "SearchSeries") {
                    return <SearchSeries key={item.id} {...item} />;
                } else if (item.__typename === "SearchRealm") {
                    return <SearchRealm key={item.id} {...item} />;
                } else {
                    // eslint-disable-next-line no-console
                    console.warn("Unknown search item type: ", item.__typename);
                    return null;
                }
            })}
        </ul>
    );
};

const SearchEvent: React.FC<EventItem> = ({
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
    matches,
}) => {
    // TODO: decide what to do in the case of more than two host realms. Direct
    // link should be avoided.
    const link = hostRealms.length !== 1
        ? DirectVideoRoute.url({ videoId: id })
        : VideoRoute.url({ realmPath: hostRealms[0].path, videoID: id });

    const highlightedCreators = creators.map((c, i) => {
        const relevantMatches = matches.creators.filter(m => m.index === i).map(m => m.span);
        return <>{highlightText(c, relevantMatches)}</>;
    });

    return (
        <Item key={id} breakpoint={BREAKPOINT_MEDIUM} link={link}>{{
            image: <Link to={link} tabIndex={-1}>
                <Thumbnail
                    event={{
                        title,
                        isLive,
                        created,
                        syncedData: {
                            duration,
                            startTime,
                            endTime,
                            thumbnail,
                            audioOnly,
                        },
                    }}
                />
            </Link>,
            info: <div css={{
                color: COLORS.neutral90,
                display: "flex",
                flexDirection: "column",
                height: "100%",
            }}>
                {hostRealms.length === 1 && (
                    <SearchBreadcrumbs ancestorNames={hostRealms[0].ancestorNames} />
                )}
                <h3 css={{
                    color: COLORS.primary1,
                    marginBottom: 3,
                    paddingBottom: 3,
                    fontSize: 17,
                    lineHeight: 1.3,
                    ...ellipsisOverflowCss(2),
                    mark: highlightCss(COLORS.primary2),
                }}>{highlightText(title, matches.title)}</h3>
                <div css={{
                    display: "flex",
                    color: COLORS.neutral80,
                    fontSize: 12,
                    gap: 24,
                    whiteSpace: "nowrap",
                }}>
                    <div css={{ display: "flex", alignItems: "center", gap: 8 }}>
                        <LuCalendar css={{ fontSize: 15, color: COLORS.neutral60 }} />
                        <RelativeDate date={new Date(startTime ?? created)} isLive={isLive} />
                    </div>
                    <Creators creators={highlightedCreators} css={{
                        minWidth: 0,
                        fontSize: 12,
                        svg: {
                            fontSize: 15,
                        },
                        ul: {
                            display: "inline-block",
                            overflow: "hidden",
                            textOverflow: "ellipsis",
                            whiteSpace: "nowrap",
                        },
                        li: {
                            display: "inline",
                        },
                        mark: highlightCss(COLORS.neutral90),
                    }} />
                </div>

                <div css={{ flexGrow: 1, maxHeight: 20 }} />

                {description && <SmallDescription
                    css={{
                        paddingLeft: 2,
                        mark: highlightCss(COLORS.neutral90),
                        fontSize: 12,
                        lineHeight: 1.4,
                    }}
                    text={highlightText(description, matches.description, 130)}
                    lines={2}
                />}

                <div css={{ flexGrow: 1 }} />

                {seriesTitle && seriesId && <PartOfSeriesLink
                    css={{
                        mark: highlightCss(COLORS.primary2),
                        fontSize: 12,
                        svg: {
                            fontSize: 15,
                        },
                    }}
                    seriesTitle={highlightText(seriesTitle, matches.seriesTitle)}
                    {...{ seriesId }}
                />}
                {/* Show timeline with matches if there are any */}
                {textMatches.length > 0 && (
                    <TextMatchTimeline {...{ id, duration, link, textMatches }} />
                )}
            </div>,
        }}</Item>
    );
};

type TextMatchTimelineProps = Pick<EventItem, "id" | "duration" | "textMatches"> & {
    link: string;
};

const slidePreviewQuery = graphql`
    query SearchSlidePreviewQuery($id: ID!, $user: String, $password: String) {
        eventById(id: $id) {
            ...on AuthorizedEvent {
                id
                authorizedData(user: $user, password: $password) {
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
    const ref = useRef<HTMLDivElement>(null);

    // We initially don't render the actual matches at all, since that costs
    // quite a bit of time, especially when there are many many matches. So
    // instead, we only render properly once the timeline is close to the
    // viewport. This means that on the initial route render, only empty
    // timelines are rendered. Then all matches inside the viewport are
    // rendered, and only when scrolling down, further matches are rendered.
    const [doRender, setDoRender] = useState(false);
    useEffect(() => {
        const handler: IntersectionObserverCallback = entries => {
            // Just checking the first element is fine as we only observe one.
            if (entries[0]?.isIntersecting) {
                startTransition(() => setDoRender(true));
            }
        };
        const observer = new IntersectionObserver(handler, {
            root: null,
            rootMargin: "200px 0px 200px 0px",
            threshold: 0,
        });
        observer.observe(ref.current!);
        return () => observer.disconnect();
    }, [setDoRender]);


    const loadSegmentImages = useCallback(() => {
        // Just calling `loadQuery` unconditionally would not send the query
        // again, but would cause a useless rerender.
        if (queryRef == null) {
            loadQuery({ id: eventId(keyOfId(id)) });
        }
    }, [queryRef, loadQuery, id]);

    // We load the query once the user hovers over the parent container. This
    // seems like it would send a query every time the mouse enters, but relay
    // caches the results, so it is only sent once.
    return (
        <div ref={ref} onMouseEnter={loadSegmentImages} onFocus={loadSegmentImages} css={{
            width: "calc(100% - 8px)",
            position: "relative",
            height: 10.5,
            margin: "12px 0 8px 0",
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

            {doRender && textMatches.map((m, i) => (
                <WithTooltip
                    key={i}
                    distance={m.ty === "CAPTION" ? 4 : 5.5}
                    tooltipCss={{
                        textAlign: "center",
                        paddingTop: 8,
                        minWidth: 160,
                        maxWidth: "min(85vw, 420px)",
                    }}
                    tooltip={<Suspense fallback={<Spinner size={24} />}>
                        {queryRef
                            ? <TextMatchTooltipWithMaybeImage queryRef={queryRef} textMatch={m} />
                            : <TextMatchTooltip textMatch={m} />}
                    </Suspense>}
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
    textMatch: EventItem["textMatches"][number];
};

const TextMatchTooltipWithMaybeImage: React.FC<TextMatchTooltipWithMaybeImageProps> = ({
    queryRef,
    textMatch,
}) => {
    const data = usePreloadedQuery(slidePreviewQuery, queryRef);
    const segments = data.eventById?.authorizedData?.segments ?? [];

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
    textMatch: EventItem["textMatches"][number];
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
                mark: highlightCss(COLORS.neutral90),
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

const SearchSeries: React.FC<SeriesItem> = ({
    id, title, description, thumbnails, matches, hostRealms,
}) => {
    // TODO: decide what to do in the case of more than two host realms. Direct
    // link should be avoided.
    const link = hostRealms.length !== 1
        ? DirectSeriesRoute.url({ seriesId: id })
        : SeriesRoute.url({ realmPath: hostRealms[0].path, seriesId: id });

    return <Item key={id} breakpoint={550} link={link}>{{
        image: <Link to={link} tabIndex={-1}>
            <ThumbnailStack {...{ thumbnails, title }} />
        </Link>,
        info: <div css={{
            display: "flex",
            flexDirection: "column",
            minWidth: 0,
        }}>
            {hostRealms.length === 1 && (
                <SearchBreadcrumbs ancestorNames={hostRealms[0].ancestorNames} />
            )}
            <h3 css={{
                color: COLORS.primary0,
                marginBottom: 3,
                paddingBottom: 3,
                fontSize: 17,
                lineHeight: 1.3,
                mark: highlightCss(COLORS.primary2),
                ...ellipsisOverflowCss(2),
            }}>{highlightText(title, matches.title)}</h3>
            {description && <SmallDescription
                css={{
                    fontSize: 12,
                    mark: highlightCss(COLORS.neutral90),
                }}
                text={highlightText(description, matches.description, 180)}
                lines={3}
            />}
        </div>,
    }}</Item>;
};

type ThumbnailStackProps = Pick<SeriesItem, "title" | "thumbnails">

export const ThumbnailStack: React.FC<ThumbnailStackProps> = ({ thumbnails, title }) => {
    const isDarkScheme = useColorScheme().scheme === "dark";

    return (
        <div css={{
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
                    <DummySeriesStackThumbnail isDark={isDarkScheme} />
                </div>
            ))}
        </div>
    );
};

const DummySeriesStackThumbnail: React.FC<{ isDark: boolean }> = ({ isDark }) => (
    <ThumbnailOverlayContainer css={{
        // Pattern from https://css-pattern.com/overlapping-cubes/,
        // MIT licensed: https://github.com/Afif13/CSS-Pattern
        "--s": "40px",
        ...isDark ? {
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
    }} />
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

type SearchBreadcrumbsProps = {
    ancestorNames: readonly (string | null | undefined)[];
};

const SearchBreadcrumbs: React.FC<SearchBreadcrumbsProps> = ({ ancestorNames }) => (
    <BreadcrumbsContainer css={{ fontSize: 12, color: COLORS.neutral80 }}>
        {ancestorNames.map((name, i) => <li key={i}>
            {name ?? <MissingRealmName />}
            <BreadcrumbSeparator />
        </li>)}
    </BreadcrumbsContainer>
);

const SearchRealm: React.FC<RealmItem> = ({
    id, name, ancestorNames, path, matches,
}) => (
    <Item key={id} link={path}>{{
        image: <div css={{
            background: COLORS.neutral25,
            color: COLORS.neutral90,
            borderRadius: "50%",
            width: "min(96px, 20vw)",
            height: "min(96px, 20vw)",
            fontSize: "min(42px, 9vw)",
            margin: "0 auto",
            display: "flex",
            alignItems: "center",
            justifyContent: "center",
        }}><LuLayout /></div>,
        info: (
            <div css={{
                padding: "6px 0",
                [screenWidthAtMost(BREAKPOINT_MEDIUM)]: {
                    padding: 0,
                },
            }}>
                <SearchBreadcrumbs ancestorNames={ancestorNames} />
                <h3 css={{
                    marginTop: 4,
                    color: COLORS.primary1,
                    fontSize: 17,
                    fontStyle: "italic",
                    mark: highlightCss(COLORS.primary2),
                }}>
                    {name ? highlightText(name, matches.name) : <MissingRealmName />}
                </h3>
            </div>
        ),
    }}</Item>
);

type ItemProps = {
    link: string;
    breakpoint?: number;
    children: {
        image: ReactNode;
        info: ReactNode;
    };
};

const Item: React.FC<ItemProps> = ({ link, breakpoint = 0, children }) => (
    <li className="search-result-item" css={{
        position: "relative",
        display: "flex",
        flexDirection: "row",
        borderRadius: 12,
        margin: 24,
        padding: 8,
        gap: 24,
        textDecoration: "none",
        transition: "background 200ms, outline-color 200ms",
        outline: "1px solid transparent",
        "&:hover, &:focus-within": {
            backgroundColor: COLORS.neutral15,
            outlineColor: COLORS.neutral20,
            transition: "background 50ms, outline-color 50ms",
        },
        [screenWidthAtMost(800)]: {
            gap: 12,
            margin: "24px 0",
        },
        [screenWidthAtMost(breakpoint)]: {
            margin: "48px 0",
            flexDirection: "column",
            gap: 12,
        },
    }}>
        <Link to={link} className="search-result-item-overlay-link" css={{
            position: "absolute",
            inset: 0,
            borderRadius: 12,
        }}/>
        <div css={{
            flexShrink: 0,
            width: "40%",
            maxWidth: 350,
            margin: "0 auto",
            [screenWidthAtMost(550)]: {
                width: "unset",
                maxWidth: "35%",
            },
            [screenWidthAtMost(breakpoint)]: {
                maxWidth: 400,
                width: "100%",
            },
        }}>{children.image}</div>
        <div css={{
            minWidth: 0,
            flex: "1",
            [screenWidthAtMost(breakpoint)]: {
                maxWidth: 400,
                width: "100%",
                margin: "0 auto",
            },
        }}>
            {children.info}
        </div>
    </li>
);

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

/**
 * Inserts `<mark>` elements inside `s` to highlight parts of text, as specified
 * by `spans`. If `maxUnmarkedSectionLen` is specified, this function makes
 * sure that all sections without any highlight (except the last one) is at
 * most that many characters¹ long. If the a section is longer, its middle is
 * replaced by " … " to stay within the limit.
 *
 * ¹ Well, technically UTF-16 code points, and this is important, but in our
 * case it's a loosy goosy business anyway, since the number only approximates
 * the available space for rendering anyway.
 */
const highlightText = (
    s: string,
    spans: readonly string[],
    maxUnmarkedSectionLen = Infinity,
) => {
    const textParts = [];
    let remainingText = s;
    let offset = 0;
    for (const encodedSpan of spans) {
        const [start, len] = encodedSpan.split("-").map(v => parseInt(v, 16));
        const span = { start, len };

        const highlightStart = span.start - offset;
        const [prefix_, middle, rest]
            = byteSlice(remainingText, highlightStart, span.len);
        let prefix = prefix_;

        // If the first part (without a match) is too long, we truncate its
        // middle.
        if (prefix.length > maxUnmarkedSectionLen) {
            const halfLen = maxUnmarkedSectionLen / 2 - 2;
            const start = prefix.substring(0, halfLen);
            const end = prefix.substring(prefix.length - halfLen);
            prefix = `${start} … ${end}`;
        }

        if (prefix) {
            textParts.push(<span key={offset}>{prefix}</span>);
        }
        textParts.push(<mark key={offset + prefix.length}>{middle}</mark>);
        remainingText = rest;
        offset = span.start + span.len;
    }
    textParts.push(remainingText);

    return textParts;
};

const highlightCss = (color: string) => ({
    color,
    backgroundColor: "var(--highlight-color)",
    borderRadius: 2,
});


// This is for profiling search performance. We might remove this later again.
export const SEARCH_TIMINGS: Record<string, {
    startSearch?: DOMHighResTimeStamp;
    routeMatch?: DOMHighResTimeStamp;
    queryReturned?: DOMHighResTimeStamp;
    rendered?: DOMHighResTimeStamp;
}> = {};
let LAST_PRINTED_TIMINGS_QUERY: string | null = null;
