import { useTranslation } from "react-i18next";
import { graphql } from "react-relay";
import { LuLayout, LuPlayCircle } from "react-icons/lu";
import { ReactNode, RefObject, useEffect } from "react";
import { screenWidthAtMost, unreachable } from "@opencast/appkit";

import { RootLoader } from "../layout/Root";
import { SearchQuery, SearchQuery$data } from "./__generated__/SearchQuery.graphql";
import { RouterControl, makeRoute } from "../rauta";
import { loadQuery } from "../relay";
import { Link, useRouter } from "../router";
import { Creators, isPastLiveEvent, Thumbnail } from "../ui/Video";
import { SmallDescription } from "../ui/metadata";
import { Card } from "../ui/Card";
import { Breadcrumbs, BreadcrumbsContainer, BreadcrumbSeparator } from "../ui/Breadcrumbs";
import { MissingRealmName } from "./util";
import { ellipsisOverflowCss } from "../ui";
import { COLORS } from "../color";
import { BREAKPOINT_MEDIUM, BREAKPOINT_SMALL } from "../GlobalStyle";
import { keyOfId } from "../util";
import { IconType } from "react-icons";


export const isSearchActive = (): boolean => document.location.pathname === "/~search";

export const SearchRoute = makeRoute(url => {
    if (url.pathname !== "/~search") {
        return null;
    }

    const q = url.searchParams.get("q") ?? "";
    const queryRef = loadQuery<SearchQuery>(query, { q });

    return {
        render: () => <RootLoader
            {...{ query, queryRef }}
            noindex
            nav={() => []}
            render={data => <SearchPage q={q} outcome={data.search} />}
        />,
        dispose: () => queryRef.dispose(),
    };
});

const query = graphql`
    query SearchQuery($q: String!) {
        ... UserData
        search(query: $q) {
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

    return <>
        <Breadcrumbs path={[]} tail={q ? t("search.title", {
            query: q,
            hits: outcome.__typename === "SearchResults" ? outcome.totalHits : 0,
        }) : t("search.no-query")} />
        <div css={{ maxWidth: 950, margin: "0 auto" }}>
            {body}
        </div>
    </>;
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
    <ul css={{ listStyle: "none", padding: 0 }}>
        {items.map(item => {
            if (item.__typename === "SearchEvent") {
                // Filter out live events that are over
                const endTime = unwrapUndefined(item.endTime);
                const isLive = unwrapUndefined(item.isLive);
                if (isPastLiveEvent(endTime, isLive)) {
                    return null;
                }

                return <SearchEvent key={item.id} {...{
                    id: item.id,
                    title: unwrapUndefined(item.title),
                    description: unwrapUndefined(item.description),
                    thumbnail: unwrapUndefined(item.thumbnail),
                    duration: unwrapUndefined(item.duration),
                    creators: unwrapUndefined(item.creators),
                    seriesTitle: unwrapUndefined(item.seriesTitle),
                    seriesId: unwrapUndefined(item.seriesId),
                    isLive,
                    audioOnly: unwrapUndefined(item.audioOnly),
                    created: unwrapUndefined(item.created),
                    startTime: unwrapUndefined(item.startTime),
                    endTime,
                    hostRealms: unwrapUndefined(item.hostRealms),
                }}/>;
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
    hideIconOnMobile?: boolean;
}>;

const WithIcon: React.FC<WithIconProps> = ({ Icon, children, hideIconOnMobile }) => (
    <div css={{
        display: "flex",
        flexDirection: "row",
        minWidth: 0,
        gap: 24,
        [screenWidthAtMost(BREAKPOINT_MEDIUM)]: {
            flexDirection: "row-reverse",
            justifyContent: "space-between",
            paddingLeft: 4,
        },
    }}>
        <Icon size={30} css={{
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
}) => {
    const { t } = useTranslation();

    // TODO: decide what to do in the case of more than two host realms. Direct
    // link should be avoided.
    const link = hostRealms.length !== 1
        ? `/!v/${(keyOfId(id))}`
        : `${hostRealms[0].path.replace(/^\/$/, "")}/v/${keyOfId(id)}`;

    return (
        <Item key={id} link={link}>
            <WithIcon Icon={LuPlayCircle} hideIconOnMobile>
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
                    {seriesTitle && seriesId && <div css={{
                        fontSize: 14,
                        marginTop: "auto",
                        paddingTop: 8,
                        overflow: "hidden",
                        textOverflow: "ellipsis",
                        whiteSpace: "nowrap",
                        padding: 3,
                    }}>
                        {t("video.part-of-series") + ": "}
                        <Link to={`/!s/${keyOfId(seriesId)}`} css={{
                            borderRadius: 4,
                            outlineOffset: 1,
                            position: "relative",
                            zIndex: 1,
                        }}>{seriesTitle}</Link>
                    </div>}
                </div>
            </WithIcon>
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
                css={{
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
                }}
            />
        </Item>
    );
};

type SearchRealmProps = {
    id: string;
    name: string | null;
    ancestorNames: readonly (string | null)[];
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
            zIndex: 1,
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


