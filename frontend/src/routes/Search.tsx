import { useTranslation } from "react-i18next";
import { graphql } from "react-relay";
import { FiFolder } from "react-icons/fi";
import { ReactNode } from "react";

import { RootLoader } from "../layout/Root";
import { SearchQuery, SearchQuery$data } from "./__generated__/SearchQuery.graphql";
import { makeRoute } from "../rauta";
import { loadQuery } from "../relay";
import { Link } from "../router";
import { Creators, isPastLiveEvent, Thumbnail } from "../ui/Video";
import { unreachable } from "../util/err";
import { SmallDescription } from "../ui/metadata";
import { Card } from "../ui/Card";
import { PageTitle } from "../layout/header/ui";
import { Breadcrumbs, BreadcrumbsContainer, BreadcrumbSeparator } from "../ui/Breadcrumbs";
import { MissingRealmName } from "./util";
import { ellipsisOverflowCss } from "../ui";
import { COLORS } from "../color";


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
                        isLive
                        startTime
                        endTime
                        created
                        hostRealms { path }
                    }
                    ... on SearchRealm { name path ancestorNames }
                }
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
        <Breadcrumbs path={[]} tail={t("search.title", { query: q })} />
        <div css={{ maxWidth: 950, margin: "0 auto" }}>
            <PageTitle title={t("search.title", { query: q })} />
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
                    isLive,
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

type SearchEventProps = {
    id: string;
    title: string;
    description: string | null;
    thumbnail: string | null;
    duration: number;
    creators: readonly string[];
    seriesTitle: string | null;
    isLive: boolean;
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
    isLive,
    created,
    startTime,
    endTime,
    hostRealms,
}) => {
    const { t } = useTranslation();

    // TODO: decide what to do in the case of more than two host realms. Direct
    // link should be avoided.
    const link = hostRealms.length !== 1
        ? `/!v/${id.slice(2)}`
        : `${hostRealms[0].path.replace(/^\/$/, "")}/v/${id.slice(2)}`;

    return (
        <Item key={id} link={link}>
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
                        audioOnly: false, // TODO
                    },
                }}
                css={{ width: "100%" }}
            />
            <div css={{ color: COLORS.neutral90 }}>
                <h3 css={{
                    marginBottom: 6,
                    ...ellipsisOverflowCss(2),
                }}>{title}</h3>
                <Creators creators={creators} />
                <SmallDescription text={description} lines={3} />
                {/* TODO: link to series */}
                {seriesTitle && <div css={{ fontSize: 14, marginTop: 4 }}>
                    {t("video.part-of-series") + ": " + seriesTitle}
                </div>}
            </div>
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
        <div css={{ textAlign: "center" }}>
            <FiFolder css={{ margin: 8, fontSize: 26 }}/>
        </div>
        <div>
            <BreadcrumbsContainer>
                {ancestorNames.map((name, i) => <li key={i}>
                    {name ?? <MissingRealmName />}
                    <BreadcrumbSeparator />
                </li>)}
            </BreadcrumbsContainer>
            <h3>{name ?? <MissingRealmName />}</h3>
        </div>
    </Item>
);

type ItemProps = {
    link: string;
    children: ReactNode;
};

const Item: React.FC<ItemProps> = ({ link, children }) => (
    <li>
        <Link
            to={link}
            css={{
                display: "flex",
                borderRadius: 4,
                margin: 16,
                padding: 8,
                gap: 16,
                textDecoration: "none",
                "&:hover, &:focus": {
                    backgroundColor: COLORS.neutral10,
                },
                "& > *:first-child": {
                    minWidth: 200,
                    width: 200,
                },
                "@media(max-width: 480px)": {
                    flexDirection: "column",
                    gap: 12,
                    "& > *:first-child": {
                        width: "100%",
                    },
                },
            }}
        >{children}</Link>
    </li>
);
