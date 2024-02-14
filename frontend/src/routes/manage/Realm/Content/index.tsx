import React, { useState, useRef, useEffect } from "react";
import { useTranslation } from "react-i18next";
import { graphql, useFragment } from "react-relay";
import { LuEye } from "react-icons/lu";
import { bug } from "@opencast/appkit";

import { RootLoader } from "../../../../layout/Root";
import type {
    ContentManageQuery,
    ContentManageQuery$data,
} from "./__generated__/ContentManageQuery.graphql";
import { ContentManageRealmData$key } from "./__generated__/ContentManageRealmData.graphql";
import { loadQuery } from "../../../../relay";
import { PathInvalid } from "..";
import { NotAuthorized } from "../../../../ui/error";
import { RealmSettingsContainer } from "../util";
import { Nav } from "../../../../layout/Navigation";
import { makeRoute } from "../../../../rauta";
import { Spinner } from "../../../../ui/Spinner";
import { AddButtons } from "./AddButtons";
import { EditBlock } from "./Block";
import { Breadcrumbs } from "../../../../ui/Breadcrumbs";
import { useNavBlocker } from "../../../util";
import { LinkButton } from "../../../../ui/Button";
import { PageTitle } from "../../../../layout/header/ui";
import { RealmEditLinks } from "../../../Realm";
import { realmBreadcrumbs } from "../../../../util/realm";
import { COLORS } from "../../../../color";


const PATH = "/~manage/realm/content";

export const ManageRealmContentRoute = makeRoute({
    url: ({ realmPath }: { realmPath: string }) =>
        `${PATH}?${new URLSearchParams({ path: realmPath })}`,
    match: url => {
        if (url.pathname !== PATH) {
            return null;
        }

        const path = url.searchParams.get("path");
        if (path === null) {
            return null;
        }

        const queryRef = loadQuery<ContentManageQuery>(query, { path });

        return {
            render: () => <RootLoader
                {...{ query, queryRef }}
                noindex
                nav={data => data.realm
                    ? [
                        <Nav key="main-nav" fragRef={data.realm} />,
                        <RealmEditLinks key="edit-buttons" path={path} />,
                    ]
                    : []}
                render={data => {
                    if (!data.realm) {
                        return <PathInvalid />;
                    } else if (!data.realm.canCurrentUserModerate) {
                        return <NotAuthorized />;
                    } else {
                        return <ManageContent data={data} />;
                    }
                }}
            />,
            dispose: () => queryRef.dispose(),
        };
    },
});

const query = graphql`
    query ContentManageQuery($path: String!) {
        ... UserData
        realm: realmByPath(path: $path) {
            canCurrentUserModerate
            ... NavigationData
            ... ContentManageRealmData
        }
    }
`;

export const ContentManageQueryContext
    = React.createContext<ContentManageQuery$data | null>(null);

type Props = {
    data: ContentManageQuery$data;
};

const ManageContent: React.FC<Props> = ({ data }) => {
    const { t } = useTranslation();
    const realm = useFragment(
        graphql`
            fragment ContentManageRealmData on Realm {
                name
                path
                isMainRoot
                ancestors { name path }
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
    const { name, path, blocks } = realm;


    const [inFlight, setInFlight] = useState(false);

    const onCommit = () => {
        setInFlight(true);
    };

    const onCommitted = () => {
        setInFlight(false);
    };


    const editedBlock = blocks.find(block => block.editMode);
    const hasUnsavedChanges = editedBlock !== undefined;
    useNavBlocker(hasUnsavedChanges);


    // When a block goes into edit mode, we want to scroll it into view
    const blockRefs = useRef(new Map<string, HTMLDivElement>());
    useEffect(() => {
        if (hasUnsavedChanges) {
            const ref = blockRefs.current.get(editedBlock.id) ?? bug("unbound ref");
            ref.scrollIntoView({ behavior: "smooth", block: "center" });
        }
    }, [hasUnsavedChanges, editedBlock]);


    const breadcrumbs = realm.isMainRoot ? [] : realmBreadcrumbs(t, realm.ancestors.concat(realm));

    return <ContentManageQueryContext.Provider value={data}>
        <RealmSettingsContainer>
            <Breadcrumbs path={breadcrumbs} tail={<i>{t("realm.edit-page-content")}</i>} />
            <PageTitle title={
                realm.isMainRoot
                    ? t("manage.realm.content.heading-root")
                    : t("manage.realm.content.heading", { realm: name })
            } />

            <LinkButton to={path}>
                {t("manage.realm.content.view-page")}
                <LuEye />
            </LinkButton>

            <div css={{
                display: "flex",
                flexDirection: "column",
                marginTop: 16,
                rowGap: 16,
                padding: 0,
                // To position the loading overlay
                position: "relative",
            }}>
                {blocks.filter(block => block != null).map((block, index) => (
                    <React.Fragment key={block.id}>
                        <AddButtons index={index} realm={realm} />

                        <div
                            ref={ref => {
                                if (ref) {
                                    blockRefs.current.set(block.id, ref);
                                } else {
                                    blockRefs.current.delete(block.id);
                                }
                            }}
                            css={block.editMode && !inFlight ? { zIndex: 2 } : {}}
                        >
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
                    backgroundColor: COLORS.neutral05,
                    opacity: 0.75,
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
