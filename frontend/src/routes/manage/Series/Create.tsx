import { graphql, useMutation } from "react-relay";

import { RootLoader } from "../../../layout/Root";
import { makeRoute } from "../../../rauta";
import { loadQuery } from "../../../relay";
import { CreateSeriesQuery } from "./__generated__/CreateSeriesQuery.graphql";
import { AccessKnownRolesData$key } from "../../../ui/__generated__/AccessKnownRolesData.graphql";
import { ManageNav } from "..";
import { CreateSeriesMutation } from "./__generated__/CreateSeriesMutation.graphql";
import { ManageSeriesDetailsRoute } from "./SeriesDetails";
import { CreateVideoList } from "../Shared/Create";
import type { User } from "../../../User";


export const CREATE_SERIES_PATH = "/~manage/create-series" as const;

export const CreateSeriesRoute = makeRoute({
    url: CREATE_SERIES_PATH,
    match: url => {
        if (url.pathname !== CREATE_SERIES_PATH) {
            return null;
        }

        const queryRef = loadQuery<CreateSeriesQuery>(query, {});

        return {
            render: () => <RootLoader
                {...{ query, queryRef }}
                noindex
                nav={() => <ManageNav active={CREATE_SERIES_PATH} />}
                render={data => <CreateSeriesPage knownRolesRef={data} />}
            />,
            dispose: () => queryRef.dispose(),
        };
    },
});

const query = graphql`
    query CreateSeriesQuery {
        ... UserData
        ... AccessKnownRolesData
    }
`;

const createSeriesMutation = graphql`
    mutation CreateSeriesMutation($metadata: BasicMetadata!, $acl: [AclInputEntry!]!) {
        createSeries(metadata: $metadata, acl: $acl) { id }
    }
`;

type CreateSeriesPageProps = {
    knownRolesRef: AccessKnownRolesData$key;
};

const CreateSeriesPage: React.FC<CreateSeriesPageProps> = ({ knownRolesRef }) => {
    const [commit, inFlight] = useMutation<CreateSeriesMutation>(createSeriesMutation);

    const canUserCreateList = (user: User) => user.canCreateSeries;

    return <CreateVideoList
        {...{ commit, inFlight, knownRolesRef, canUserCreateList }}
        kind="series"
        returnPath={response =>
            ManageSeriesDetailsRoute.url({ id: response.createSeries.id })
        }
    />;
};


