import { graphql, useMutation } from "react-relay";
import { currentRef } from "@opencast/appkit";

import { AccessKnownRolesData$key } from "../../../ui/__generated__/AccessKnownRolesData.graphql";
import { makeManageSeriesRoute, Series } from "./Shared";
import { ManageSeriesRoute } from ".";
import { ManageSeriesDetailsRoute } from "./SeriesDetails";
import { displayCommitError } from "../Realm/util";
import { AccessEditor, AclPage, SubmitAclProps } from "../Shared/Access";
import i18n from "../../../i18n";
import { SeriesAccessAclMutation } from "./__generated__/SeriesAccessAclMutation.graphql";


export const ManageSeriesAccessRoute = makeManageSeriesRoute(
    "acl",
    "/access",
    (series, data) => (
        <AclPage breadcrumbTails={[
            { label: i18n.t("manage.my-series.title"), link: ManageSeriesRoute.url },
            { label: series.title, link: ManageSeriesDetailsRoute.url({ seriesId: series.id }) },
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

    return <AccessEditor {...{ onSubmit, inFlight, data }} rawAcl={series.acl} />;
};

