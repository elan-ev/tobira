import { currentRef } from "@opencast/appkit";
import { graphql, useMutation } from "react-relay";
import { useTranslation } from "react-i18next";

import { AccessKnownRolesData$key } from "../../../ui/__generated__/AccessKnownRolesData.graphql";
import { makeManageSeriesRoute, Series } from "./Shared";
import { ManageSeriesRoute } from ".";
import { ManageSeriesDetailsRoute } from "./SeriesDetails";
import { displayCommitError } from "../Realm/util";
import { AccessEditor, AclPage, SubmitAclProps } from "../Shared/Access";
import i18n from "../../../i18n";
import { SeriesAccessAclMutation } from "./__generated__/SeriesAccessAclMutation.graphql";
import { isSynced } from "../../../util";
import { NoteWithTooltip } from "../../../ui";


export const ManageSeriesAccessRoute = makeManageSeriesRoute(
    "acl",
    "/access",
    (series, data) => (
        <AclPage note={!isSynced(series) && <NotSyncedNote />} breadcrumbTails={[
            { label: i18n.t("manage.my-series.title"), link: ManageSeriesRoute.url },
            { label: series.title, link: ManageSeriesDetailsRoute.url({ seriesId: series.id }) },
        ]}>
            <SeriesAclEditor {...{ series, data }} />
        </AclPage>
    ),
);

const NotSyncedNote: React.FC = () => {
    const { t } = useTranslation();

    return <NoteWithTooltip
        note={t("series.not-ready.title")}
        tooltip={t("series.not-ready.text")}
    />;
};


const updateSeriesAcl = graphql`
    mutation SeriesAccessAclMutation($id: ID!, $acl: [AclInputEntry!]!) {
        updateSeriesAcl(id: $id, acl: $acl) {
            ...on Series {
                acl { role actions info { label implies large } }
            }
        }
    }
`;


type SeriesAclPageProps = {
    series: Series;
    data: AccessKnownRolesData$key;
};

const SeriesAclEditor: React.FC<SeriesAclPageProps> = ({ series, data }) => {
    const [commit, inFlight] = useMutation<SeriesAccessAclMutation>(updateSeriesAcl);

    const onSubmit = async ({ selections, saveModalRef, setCommitError }: SubmitAclProps) => {
        commit({
            variables: {
                id: series.id,
                acl: [...selections].map(
                    ([role, { actions }]) => ({
                        role,
                        actions: [...actions],
                    })
                ),
            },
            onCompleted: () => currentRef(saveModalRef).done(),
            onError: error => {
                setCommitError(displayCommitError(error));
            },
        });
    };

    return <AccessEditor
        {...{ onSubmit, inFlight, data }}
        rawAcl={series.acl}
        editingBlocked={!isSynced(series)}
    />;
};

