import { useTranslation } from "react-i18next";
import { graphql } from "react-relay";

import { RootLoader } from "../layout/Root";
import { SearchQuery, SearchQueryResponse } from "./__generated__/SearchQuery.graphql";
import { makeRoute } from "../rauta";
import { loadQuery } from "../relay";
import { Link } from "../router";
import { Thumbnail } from "../ui/Video";
import { bug } from "../util/err";
import { Description } from "../ui/metadata";
import { Card } from "../ui/Card";
import { PageTitle } from "../layout/header/ui";
import { FiFolder } from "react-icons/fi";
import { TFunction } from "i18next";
import { HiOutlineUserCircle } from "react-icons/hi";


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
    results: SearchQueryResponse["search"];
};

const SearchPage: React.FC<Props> = ({ q, results }) => {
    const { t } = useTranslation();

    return <div css={{ maxWidth: 950, margin: "0 auto" }}>
        <PageTitle title={t("search.title", { query: q })} />
        {results === null
            ? <CenteredNote>{t("search.too-few-characters")}</CenteredNote>
            : results.items.length === 0
                ? <CenteredNote>{t("search.no-results")}</CenteredNote>
                : <SearchResults items={results.items} t={t} />
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
    t: TFunction;
};

const SearchResults: React.FC<SearchResultsProps> = ({ items, t }) => (
    <ul css={{ listStyle: "none", padding: 0 }}>
        {items.map(item => {
            if (item.__typename === "SearchEvent") {
                const title = item.title ?? bug("SearchEvent without title");
                const creators = item.creators ?? bug("SearchEvent without creators");
                return (
                    <Item key={item.id} link={`/!${item.id.slice(2)}`}>
                        <Thumbnail
                            event={{
                                title,
                                thumbnail: item.thumbnail ?? null,
                                duration: item.duration ?? bug("SearchEvent without duration"),
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
                            <Description text={item.description ?? null} lines={3} />
                            {/* TODO: link to series */}
                            {item.seriesTitle && <div css={{ fontSize: 14, marginTop: 4 }}>
                                {t("video.part-of-series") + ": " + item.seriesTitle}
                            </div>}
                        </div>
                    </Item>
                );
            } else if (item.__typename === "SearchRealm") {
                const fullPath = item.path ?? bug("fullPath is null for realm");
                const ancestorNames = item.ancestorNames ?? bug("ancestorNames missing for realm");
                return (
                    <Item key={item.id} link={fullPath}>
                        <div css={{ textAlign: "center" }}>
                            <FiFolder css={{ margin: 8, fontSize: 26 }}/>
                        </div>
                        <div>
                            {/* TODO: use proper breadcrumbs, not this uhg */}
                            <div>
                                {"/ " + ancestorNames.map(name => name + " / ").join("")}
                            </div>
                            <h3>{item.name}</h3>
                        </div>
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
