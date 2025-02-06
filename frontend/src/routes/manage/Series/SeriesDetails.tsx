import { graphql, useMutation } from "react-relay";

import i18n from "../../../i18n";
import { makeManageSeriesRoute } from "./Shared";
import { ManageSeriesRoute } from ".";
import { DirectSeriesRoute } from "../../Series";
import {
    DetailsPage,
    UpdatedCreatedInfo,
    DirectLink,
    DetailsMetadataSection,
    DeleteButton,
} from "../Shared/Details";
import {
    SeriesDetailsMetadataMutation,
} from "./__generated__/SeriesDetailsMetadataMutation.graphql";
import { Item } from "../Shared/Table";
import { isSynced } from "../../../util";


const updateSeriesMetadata = graphql`
    mutation SeriesDetailsMetadataMutation($id: ID!, $title: String!, $description: String) {
        updateSeriesMetadata(id: $id, title: $title, description: $description) { id }
    }
`;

const deleteSeriesMutation = graphql`
    mutation SeriesDetailsDeleteMutation($id: ID!) {
        deleteSeries(id: $id) { id }
    }
`;

export const ManageSeriesDetailsRoute = makeManageSeriesRoute(
    "details",
    "",
    series => <DetailsPage
        pageTitle="manage.my-series.details.title"
        item={{
            ...series,
            description: series.syncedData?.description,
            isSynced: isSynced(series),
        }}
        breadcrumb={{
            label: i18n.t("manage.my-series.title"),
            link: ManageSeriesRoute.url,
        }}
        sections={series => [
            <UpdatedCreatedInfo key="created-info" item={series} />,
            <SeriesButtonSection key="button-section" seriesId={series.id} />,
            <DirectLink key="direct-link" url={
                new URL(DirectSeriesRoute.url({ seriesId: series.id }), document.baseURI)
            } />,
            <div key="metadata" css={{ marginBottom: 32 }}>
                <SeriesMetadataSection series={series} />
            </div>,
        ]}
    />,
);

const SeriesButtonSection: React.FC<{ seriesId: string }> = ({ seriesId }) => {
    const [commit] = useMutation(deleteSeriesMutation);

    return <div css={{ display: "flex", gap: 12, marginBottom: 16 }}>
        <DeleteButton
            itemId={seriesId}
            itemType="series"
            returnPath="/~manage/series"
            commit={config => {
                const disposable = commit(config);
                return { [Symbol.dispose]: () => disposable.dispose() };
            }}
        />
    </div>;
};

const SeriesMetadataSection: React.FC<{ series: Item }> = ({ series }) => {
    const [commit, inFlight]
        = useMutation<SeriesDetailsMetadataMutation>(updateSeriesMetadata);

    return <DetailsMetadataSection<SeriesDetailsMetadataMutation>
        item={series}
        inFlight={inFlight}
        commit={config => {
            const disposable = commit(config);
            return { [Symbol.dispose]: () => disposable.dispose() };
        }}
    />;
};
