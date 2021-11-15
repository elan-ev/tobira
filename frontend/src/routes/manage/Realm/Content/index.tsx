import React from "react";
import { useTranslation } from "react-i18next";
import { graphql, useFragment, PreloadedQuery } from "react-relay";

import { Root } from "../../../../layout/Root";
import type { ContentManageQuery } from "../../../../query-types/ContentManageQuery.graphql";
import type { ContentManageData$key } from "../../../../query-types/ContentManageData.graphql";
import { loadQuery } from "../../../../relay";
import { NotAuthorized, PathInvalid } from "..";
import { RealmSettingsContainer } from "../util";
import { Nav } from "../../../../layout/Navigation";
import { makeRoute } from "../../../../rauta";
import { QueryLoader } from "../../../../util/QueryLoader";
import { match } from "../../../../util";
import { TextBlockByQuery } from "../../../../ui/blocks/Text";
import { SeriesBlockFromBlock } from "../../../../ui/blocks/Series";
import { AddButtons } from "./AddButtons";
import { EditButtons } from "./Edit";


export const PATH = "/~manage/realm/content";

export const ManageRealmContentRoute = makeRoute<PreloadedQuery<ContentManageQuery>, ["path"]>({
    path: PATH,
    queryParams: ["path"],
    prepare: ({ queryParams: { path } }) => loadQuery(query, { path }),
    render: queryRef => <QueryLoader {...{ query, queryRef }} render={result => {
        const { realm } = result;
        const nav = realm ? <Nav fragRef={realm} /> : [];

        let children = null;
        if (!realm) {
            children = <PathInvalid />;
        } else if (!realm.canCurrentUserEdit) {
            children = <NotAuthorized />;
        } else {
            children = <ManageContent fragRef={realm} />;
        }

        return <Root nav={nav} userQuery={result}>
            {children}
        </Root>;
    }} />,
    dispose: queryRef => queryRef.dispose(),
});


const query = graphql`
    query ContentManageQuery($path: String!) {
        ... UserData
        realm: realmByPath(path: $path) {
            canCurrentUserEdit
            ... NavigationData
            ... ContentManageData
        }
    }
`;


type Props = {
    fragRef: ContentManageData$key;
};

const ManageContent: React.FC<Props> = ({ fragRef }) => {
    const { t } = useTranslation();

    const realm = useFragment(
        graphql`
            fragment ContentManageData on Realm {
                name
                path
                isRoot
                ... EditButtonsRealmData
                blocks {
                    id
                    title
                    __typename
                    ... on SeriesBlock { ... SeriesBlockData }
                    ... on TextBlock { ... TextBlockData }
                }
            }
        `,
        fragRef,
    );
    const { name, path, isRoot: realmIsRoot, blocks } = realm;

    return <RealmSettingsContainer>
        <h1>
            {realmIsRoot
                ? t("manage.realm.content.heading-root")
                : t("manage.realm.content.heading", { realm: name })}
        </h1>

        <div css={{
            display: "flex",
            flexDirection: "column",
            rowGap: 16,
            padding: 0,
        }}>
            {blocks.map((block, index) => (
                <React.Fragment key={block.id}>
                    <AddButtons index={index} />

                    <div css={{
                        alignSelf: "stretch",
                        border: "1px solid var(--grey80)",
                        borderRadius: 4,
                        padding: 8,
                        overflow: "hidden",
                    }}>
                        <EditButtons {...{ realm, index }} />

                        {match(block.__typename, {
                            "TextBlock": () => <TextBlockByQuery
                                title={block.title ?? undefined}
                                fragRef={block}
                            />,
                            "SeriesBlock": () => <SeriesBlockFromBlock
                                title={block.title ?? undefined}
                                realmPath={path}
                                fragRef={block}
                            />,
                        })}
                    </div>
                </React.Fragment>
            ))}
            <AddButtons index={blocks.length} />
        </div>
    </RealmSettingsContainer>;
};
