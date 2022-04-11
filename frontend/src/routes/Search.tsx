import { useTranslation } from "react-i18next";
import { graphql } from "react-relay";

import { RootLoader } from "../layout/Root";
import { SearchQuery, SearchQuery$data } from "./__generated__/SearchQuery.graphql";
import { makeRoute } from "../rauta";
import { loadQuery } from "../relay";
import { Link } from "../router";
import { Thumbnail } from "../ui/Video";
import { unreachable } from "../util/err";
import { Description } from "../ui/metadata";
import { Card } from "../ui/Card";
import { PageTitle } from "../layout/header/ui";
import { FiFolder } from "react-icons/fi";
import { HiOutlineUserCircle } from "react-icons/hi";
import { ReactNode } from "react";


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
            nav={() => []}
            render={data => <SearchPage q={q} results={data.search} />}
        />,
        dispose: () => queryRef.dispose(),
    };
});

const query = graphql`
    query SearchQuery($q: String!) {
        ... UserData
        search(query: $q) {
            items {
                id
                __typename
                ... on SearchEvent { title description thumbnail duration creators seriesTitle }
                ... on SearchRealm { name path ancestorNames }
            }
        }
    }
`;

type Props = {
    q: string;
    results: SearchQuery$data["search"];
};

const SearchPage: React.FC<Props> = ({ q, results }) => {
    const { t } = useTranslation();

    return <div css={{ maxWidth: 950, margin: "0 auto" }}>
        <PageTitle title={t("search.title", { query: q })} />
        {results === null
            ? <CenteredNote>{t("search.too-few-characters")}</CenteredNote>
            : results.items.length === 0
                ? <CenteredNote>{t("search.no-results")}</CenteredNote>
                : <SearchResults items={results.items} />
        }
    </div>;
};

const CenteredNote: React.FC<{ children: ReactNode }> = ({ children }) => (
    <div css={{ textAlign: "center" }}>
        <Card kind="info">{children}</Card>
    </div>
);

type SearchResultsProps = {
    items: NonNullable<SearchQuery$data["search"]>["items"];
};

const unwrapUndefined = <T, >(value: T | undefined): T => typeof value === "undefined"
    ? unreachable("type dependent field for search item is not set")
    : value;

const SearchResults: React.FC<SearchResultsProps> = ({ items }) => (
    <ul css={{ listStyle: "none", padding: 0 }}>
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
};

const SearchEvent: React.FC<SearchEventProps> = ({
    id, title, description, thumbnail, duration, creators, seriesTitle,
}) => {
    const { t } = useTranslation();

    return (
        <Item key={id} link={`/!${id.slice(2)}`}>
            <Thumbnail
                event={{
                    title,
                    thumbnail: thumbnail ?? null,
                    duration: duration,
                    audioOnly: false, // TODO
                }}
                css={{ width: "100%" }}
            />
            <div css={{ color: "black" }}>
                <h3 css={{
                    marginBottom: 6,
                    display: "-webkit-box",
                    WebkitBoxOrient: "vertical",
                    overflow: "hidden",
                    textOverflow: "ellipsis",
                    WebkitLineClamp: 2,
                }}>{title}</h3>
                <div css={{ fontSize: 14, display: "flex", alignItems: "center" }}>
                    <HiOutlineUserCircle css={{
                        color: "var(--grey40)",
                        fontSize: 16,
                        marginRight: 8,
                    }} />
                    {creators.join(", ")}
                </div>
                <Description text={description} lines={3} />
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
    name: string;
    ancestorNames: readonly string[];
    fullPath: string;
};

const SearchRealm: React.FC<SearchRealmProps> = ({ id, name, ancestorNames, fullPath }) => (
    <Item key={id} link={fullPath}>
        <div css={{ textAlign: "center" }}>
            <FiFolder css={{ margin: 8, fontSize: 26 }}/>
        </div>
        <div>
            {/* TODO: use proper breadcrumbs, not this uhg */}
            <div>
                {"/ " + ancestorNames.map(name => name + " / ").join("")}
            </div>
            <h3>{name}</h3>
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
                "&:hover": {
                    backgroundColor: "var(--grey97)",
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
