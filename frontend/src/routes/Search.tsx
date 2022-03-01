import { useTranslation } from "react-i18next";
import { graphql } from "react-relay";

import { RootLoader } from "../layout/Root";
import { SearchQuery, SearchQueryResponse } from "./__generated__/SearchQuery.graphql";
import { makeRoute } from "../rauta";
import { loadQuery } from "../relay";
import { Link } from "../router";
import { Thumbnail } from "../ui/Video";
import { useTitle } from "../util";
import { bug } from "../util/err";
import { Description } from "../ui/metadata";
import { FiFolder } from "react-icons/fi";
import { Card } from "../ui/Card";


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
        rootRealm { ... NavigationData }
        search(query: $q) {
            items {
                id
                __typename
                ... on SearchEvent { title description thumbnail duration tracks { resolution }}
                ... on SearchRealm { name fullPath }
            }
        }
    }
`;

type Props = {
    q: string;
    results: SearchQueryResponse["search"];
};

const SearchPage: React.FC<Props> = ({ q, results }) => {
    const { t } = useTranslation();
    const title = t("search.title", { query: q });
    useTitle(title);

    return <div css={{ maxWidth: 950, margin: "0 auto" }}>
        <h1>{title}</h1>
        {results === null
            ? <CenteredNote>{t("search.too-few-characters")}</CenteredNote>
            : results.items.length === 0
                ? <CenteredNote>{t("search.no-results")}</CenteredNote>
                : <SearchResults items={results.items} />
        }
    </div>;
};

const CenteredNote: React.FC = ({ children }) => (
    <div css={{ textAlign: "center" }}>
        <Card kind="info">{children}</Card>
    </div>
);

type SearchResultsProps = {
    items: NonNullable<SearchQueryResponse["search"]>["items"];
};

const SearchResults: React.FC<SearchResultsProps> = ({ items }) => (
    <ul css={{ listStyle: "none", padding: 0 }}>
        {items.map(item => {
            if (item.__typename === "SearchEvent") {
                return (
                    <Item key={item.id} link={`/!${item.id.slice(2)}`}>
                        <Thumbnail
                            event={{
                                title: item.title ?? bug("SearchEvent without title"),
                                thumbnail: item.thumbnail ?? null,
                                duration: item.duration ?? bug("SearchEvent without duration"),
                                tracks: item.tracks ?? bug("SearchEvent without tracks"),
                            }}
                            css={{ width: "100%" }}
                        />
                        <div>
                            <h3 css={{
                                marginBottom: 6,
                                display: "-webkit-box",
                                WebkitBoxOrient: "vertical",
                                overflow: "hidden",
                                textOverflow: "ellipsis",
                                WebkitLineClamp: 2,
                            }}>{item.title}</h3>
                            <Description text={item.description ?? null} lines={3} />
                        </div>
                    </Item>
                );
            } else if (item.__typename === "SearchRealm") {
                const fullPath = item.fullPath ?? bug("fullPath is null for realm");
                // TODO: show breadcrumbs
                return (
                    <Item key={item.id} link={fullPath}>
                        <div css={{ textAlign: "center" }}>
                            <FiFolder css={{ margin: 8, fontSize: 26 }}/>
                        </div>
                        <h3>{item.name}</h3>
                    </Item>
                );
            } else {
                // eslint-disable-next-line no-console
                console.warn("Unknown search item type: ", item.__typename);
                return null;
            }
        })}
    </ul>
);

type ItemProps = {
    link: string;
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
