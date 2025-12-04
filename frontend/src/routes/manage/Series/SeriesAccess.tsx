import { currentRef } from "@opencast/appkit";
import { graphql, useMutation } from "react-relay";

import { AccessKnownRolesData$key } from "../../../ui/__generated__/AccessKnownRolesData.graphql";
import { makeManageSeriesRoute, Series } from "./Shared";
import { ManageSeriesRoute } from ".";
import { ManageSeriesDetailsRoute } from "./SeriesDetails";
import { displayCommitError } from "../Realm/util";
import { AccessEditor, AclPage, SubmitAclProps } from "../Shared/Access";
import i18n from "../../../i18n";
import { SeriesAccessAclMutation } from "./__generated__/SeriesAccessAclMutation.graphql";
import { isSynced } from "../../../util";
import { aclMapToArray, NotReadyNote } from "../../util";


export const ManageSeriesAccessRoute = makeManageSeriesRoute(
    "acl",
    "/access",
    (series, data) => (
        <AclPage note={!isSynced(series) && <NotReadyNote kind="series" />} breadcrumbTails={[
            { label: i18n.t("manage.series.table.title"), link: ManageSeriesRoute.url },
            { label: series.title, link: ManageSeriesDetailsRoute.url({ id: series.id }) },
        ]}>
            <SeriesAclEditor {...{ series, data }} />
        </AclPage>
    ),
);

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
                acl: aclMapToArray(selections),
            },
            onCompleted: () => currentRef(saveModalRef).done(),
            onError: error => {
                setCommitError(displayCommitError(error));
            },
        });
    };

    return <AccessEditor
        editingBlocked={!isSynced(series)}
        {...{ onSubmit, inFlight, data }}
        rawAcl={series.acl}
        itemType="series"
    />;
};

