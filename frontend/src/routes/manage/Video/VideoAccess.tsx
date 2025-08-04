import { Trans, useTranslation } from "react-i18next";
import { Card, currentRef } from "@opencast/appkit";
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
import { isSynced } from "../../../util";
import { aclMapToArray, NotReadyNote } from "../../util";


export const ManageVideoAccessRoute = makeManageVideoRoute(
    "acl",
    "/access",
    (event, data) => (
        <AclPage note={event.hostRealms.length < 1 && <UnlistedNote />} breadcrumbTails={[
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
                workflowStatus
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
    const workflowStatus = event.workflowStatus;

    const editingBlocked = !isSynced(event) || workflowStatus !== "IDLE" || aclLockedToSeries;

    const onSubmit = async ({ selections, saveModalRef, setCommitError }: SubmitAclProps) => {
        commit({
            variables: {
                id: event.id,
                acl: aclMapToArray(selections),
            },
            onCompleted: () => currentRef(saveModalRef).done(),
            onError: error => setCommitError(displayCommitError(error)),
        });
    };

    return <>
        {!isSynced(event)
            ? <NotReadyNote kind="video" />
            : workflowStatus !== "IDLE" && <Card kind="info" css={{ marginBottom: 20 }}>
                <Trans i18nKey={`manage.video.workflow-status.${
                    workflowStatus === "BUSY" ? "active" : "unknown"
                }`} />
            </Card>
        }
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
    </>;
};

