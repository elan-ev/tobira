import { Trans, useTranslation } from "react-i18next";
import { Card, currentRef } from "@opencast/appkit";
import { useState } from "react";
import { graphql, useMutation } from "react-relay";

import { AuthorizedEvent, makeManageVideoRoute } from "./Shared";
import { AccessKnownRolesData$key } from "../../../ui/__generated__/AccessKnownRolesData.graphql";
import { ManageVideosRoute } from ".";
import { ManageVideoDetailsRoute } from "./VideoDetails";
import { displayCommitError } from "../Realm/util";
import CONFIG from "../../../config";
import { AccessEditor, AclPage, SubmitAclProps } from "../Shared/Access";
import i18n from "../../../i18n";
import { VideoAccessAclMutation } from "./__generated__/VideoAccessAclMutation.graphql";
import { NoteWithTooltip } from "../../../ui";
import { Link } from "../../../router";
import { ManageSeriesAccessRoute } from "../Series/SeriesAccess";
import { Inertable } from "../../../util";


export const ManageVideoAccessRoute = makeManageVideoRoute(
    "acl",
    "/access",
    (event, data) => (
        <AclPage note={<UnlistedNote />} breadcrumbTails={[
            { label: i18n.t("manage.video.table"), link: ManageVideosRoute.url },
            { label: event.title, link: ManageVideoDetailsRoute.url({ videoId: event.id }) },
        ]}>
            <EventAclEditor {...{ event, data }} />
        </AclPage>
    ),
    { fetchWorkflowState: true },
);


const UnlistedNote: React.FC = () => {
    const { t } = useTranslation();

    return <NoteWithTooltip
        note={t("acl.unlisted.note")}
        tooltip={t("acl.unlisted.explanation")}
    />;
};


const updateVideoAcl = graphql`
    mutation VideoAccessAclMutation($id: ID!, $acl: [AclInputEntry!]!) {
        updateEventAcl(id: $id, acl: $acl) {
            ...on AuthorizedEvent {
                acl { role actions info { label implies large } }
                hasActiveWorkflows
            }
        }
    }
`;


type EventAclPageProps = {
    event: AuthorizedEvent;
    data: AccessKnownRolesData$key;
};

const EventAclEditor: React.FC<EventAclPageProps> = ({ event, data }) => {
    const [commit, inFlight] = useMutation<VideoAccessAclMutation>(updateVideoAcl);
    const aclLockedToSeries = CONFIG.lockAclToSeries && !!event.series;
    const [editingBlocked, setEditingBlocked] = useState(
        event.hasActiveWorkflows || aclLockedToSeries,
    );

    const onSubmit = async ({ selections, saveModalRef, setCommitError }: SubmitAclProps) => {
        commit({
            variables: {
                id: event.id,
                acl: [...selections].map(
                    ([role, { actions }]) => ({
                        role,
                        actions: [...actions],
                    }),
                ),
            },
            onCompleted: () => currentRef(saveModalRef).done(),
            onError: error => {
                setEditingBlocked(true);
                setCommitError(displayCommitError(error));
            },
        });
    };

    return <Inertable isInert={event.hasActiveWorkflows || aclLockedToSeries || editingBlocked}>
        {event.hasActiveWorkflows && <Card kind="info" css={{ marginBottom: 20 }}>
            <Trans i18nKey="acl.workflow-active" />
        </Card>}
        {aclLockedToSeries && (
            <Card kind="info" iconPos="left" css={{ fontSize: 14, marginBottom: 10 }}>
                <Trans i18nKey="acl.locked-to-series">
                    series
                    <Link to={ManageSeriesAccessRoute.url({ seriesId: event.series.id })} />
                </Trans>
            </Card>
        )}
        <AccessEditor itemType="video" rawAcl={event.acl} {...{
            onSubmit,
            inFlight,
            data,
            editingBlocked,
        }} />
    </Inertable>;
};

