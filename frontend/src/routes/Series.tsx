import { graphql } from "react-relay";
import { useTranslation } from "react-i18next";

import { loadQuery } from "../relay";
import { makeRoute } from "../rauta";
import { SeriesBlockFromSeries } from "../ui/Blocks/Series";
import { RootLoader } from "../layout/Root";
import { Nav } from "../layout/Navigation";
import { PageTitle } from "../layout/header/ui";

import { NotFound } from "./NotFound";
import {
    SeriesByOpencastIdQuery,
    SeriesByOpencastIdQuery$data,
} from "./__generated__/SeriesByOpencastIdQuery.graphql";


export const DirectSeriesRoute = makeRoute(url => {

    const regex = new RegExp("^/!s/:(.+)", "u");
    const path = decodeURIComponent(url.pathname);
    const matches = path.match(regex);

    if (!matches) {
        return null;
    }


    const [, opencastId] = matches;
    const query = graphql`
        query SeriesByOpencastIdQuery($id: String!) {
            ... UserData
            series: seriesByOpencastId(id: $id) {
                title
                description
                ... SeriesBlockSeriesData
            }
            rootRealm {
               ... NavigationData
            }
        }
    `;
    const queryRef = loadQuery<SeriesByOpencastIdQuery>(query, { id: opencastId });


    return {
        render: () => <RootLoader
            {...{ query, queryRef }}
            nav={data => <Nav fragRef={data.rootRealm} />}
            render={result => <SeriesPage {...result} />}
        />,
        dispose: () => queryRef.dispose(),
    };
});

const SeriesPage: React.FC<SeriesByOpencastIdQuery$data> = ({ series }) => {
    const { t } = useTranslation();

    if (!series) {
        return <NotFound kind="series" />;
    }

    return <>
        <PageTitle title={series.title} />
        <p>{series.description}</p>
        <SeriesBlockFromSeries
            title={t("series.videos.heading")}
            basePath="/!v"
            fragRef={series}
        />
    </>;
};
