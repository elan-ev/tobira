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
    useTitle(t("search.title", { query: q }));

    if (results === null) {
        return <p>Please type more characters!!</p>; // TODO
    }

    return <>
        <ul css={{ listStyle: "none" }}>
            {results.items.map(item => {
                if (item.__typename === "SearchEvent") {
                    return (
                        <Item key={item.id} link={`/!${item.id.slice(2)}`}>
                            <div css={{ display: "flex", gap: 16 }}>
                                <Thumbnail
                                    event={{
                                        thumbnail: item.thumbnail ?? null,
                                        duration: item.duration ?? null,
                                        tracks: item.tracks ?? bug(""),
                                    }}
                                    css={{ width: 10 * 16 }}
                                />
                                {item.title}
                            </div>
                        </Item>
                    );
                } else if (item.__typename === "SearchRealm") {
                    const fullPath = item.fullPath ?? bug("fullPath is null for realm");
                    return (
                        <Item key={item.id} link={fullPath}>{item.name}</Item>
                    );
                } else {
                    console.warn("Unknown search item type: ", item.__typename);
                    return null;
                }
            })}
        </ul>
    </>;
};

type ItemProps = {
    link: string;
};

const Item: React.FC<ItemProps> = ({ link, children }) => (
    <li>
        <Link
            to={link}
            css={{
                display: "block",
                backgroundColor: "var(--grey97)",
                borderRadius: 4,
                margin: 4,
                padding: 4,
            }}
        >{children}</Link>
    </li>
);
