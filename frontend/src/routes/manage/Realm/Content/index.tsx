import React, { useState } from "react";
import { useTranslation } from "react-i18next";
import { graphql, useFragment, PreloadedQuery } from "react-relay";
import { useBeforeunload } from "react-beforeunload";

import { Root } from "../../../../layout/Root";
import type {
    ContentManageQuery,
    ContentManageQueryResponse,
} from "../../../../query-types/ContentManageQuery.graphql";
import { ContentManageRealmData$key } from "../../../../query-types/ContentManageRealmData.graphql";
import { loadQuery } from "../../../../relay";
import { NotAuthorized, PathInvalid } from "..";
import { RealmSettingsContainer } from "../util";
import { Nav } from "../../../../layout/Navigation";
import { makeRoute } from "../../../../rauta";
import { QueryLoader } from "../../../../util/QueryLoader";
import { Spinner } from "../../../../ui/Spinner";
import { AddButtons } from "./AddButtons";
import { EditBlock } from "./Block";


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
            children = <ManageContent data={result} />;
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
            ... ContentManageRealmData
        }
        ... SeriesEditModeSeriesData
    }
`;

export const ContentManageQueryContext
    = React.createContext<ContentManageQueryResponse | null>(null);

type Props = {
    data: ContentManageQueryResponse;
};

const ManageContent: React.FC<Props> = ({ data }) => {
    const { t } = useTranslation();

    const realm = useFragment(
        graphql`
            fragment ContentManageRealmData on Realm {
                name
                path
                isRoot
                ... BlockRealmData
                ... AddButtonsRealmData
                blocks {
                    id
                    editMode
                }
            }
        `,
        data.realm as ContentManageRealmData$key,
    );
    const { name, isRoot: realmIsRoot, blocks } = realm;


    const [inFlight, setInFlight] = useState(false);

    const onCommit = () => {
        setInFlight(true);
    };

    const onCommitted = () => {
        setInFlight(false);
    };


    const hasUnsavedChanges = blocks.some(block => block.editMode);

    useBeforeunload(event => {
        if (hasUnsavedChanges) {
            event.preventDefault();
        }
    });


    return <ContentManageQueryContext.Provider value={data}>
        <RealmSettingsContainer>
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
                // To position the loading overlay
                position: "relative",
            }}>
                {blocks.filter(block => block != null).map((block, index) => (
                    <React.Fragment key={block.id}>
                        <AddButtons index={index} realm={realm} />

                        <div css={block.editMode && !inFlight ? { zIndex: 2 } : {}}>
                            <EditBlock
                                {...{ realm, index }}
                                onCommit={onCommit}
                                onCompleted={onCommitted}
                                onError={onCommitted}
                            />
                        </div>
                    </React.Fragment>
                ))}
                <AddButtons index={blocks.length} realm={realm} />

                <div css={{
                    display: "flex",
                    alignItems: "center",
                    justifyContent: "center",
                    backgroundColor: "rgba(255, 255, 255, 0.5)",
                    position: "absolute",
                    width: "100%",
                    height: "100%",
                    ...(hasUnsavedChanges || inFlight ? {} : { zIndex: -1 }),
                }}>
                    {inFlight && <Spinner size={20} />}
                </div>
            </div>
        </RealmSettingsContainer>
    </ContentManageQueryContext.Provider>;
};
