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
    SharedDetailsProps,
    DeleteButton,
} from "../Shared/Details";
import {
    SeriesDetailsMetadataMutation,
} from "./__generated__/SeriesDetailsMetadataMutation.graphql";


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
        asset={{
            ...series,
            description: series.syncedData?.description,
            urlProps: {
                url: new URL(DirectSeriesRoute.url({ seriesId: series.id }), document.baseURI),
            },
        }}
        breadcrumb={{
            label: i18n.t("manage.my-series.title"),
            link: ManageSeriesRoute.url,
        }}
        sections={series => [
            <UpdatedCreatedInfo key="created-info" asset={series} />,
            <SeriesButtonSection key="button-section" seriesId={series.id} />,
            <DirectLink key="direct-link" asset={series} />,
            <div key="metadata" css={{ marginBottom: 32 }}>
                <SeriesMetadataSection asset={series} />
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

const SeriesMetadataSection: React.FC<SharedDetailsProps> = ({ asset }) => {
    const [commit, inFlight]
        = useMutation<SeriesDetailsMetadataMutation>(updateSeriesMetadata);

    return <DetailsMetadataSection<SeriesDetailsMetadataMutation>
        asset={asset}
        inFlight={inFlight}
        commit={config => {
            const disposable = commit(config);
            return { [Symbol.dispose]: () => disposable.dispose() };
        }}
    />;
};
