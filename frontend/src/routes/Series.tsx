import { graphql } from "react-relay";
import { useTranslation } from "react-i18next";

import { loadQuery } from "../relay";
import { makeRoute } from "../rauta";
import { SeriesBlockFromSeries } from "../ui/Blocks/Series";
import { RootLoader } from "../layout/Root";
import { Nav } from "../layout/Navigation";
import { PageTitle } from "../layout/header/ui";

import { NotFound } from "./NotFound";
import { SeriesByOpencastIdQuery } from "./__generated__/SeriesByOpencastIdQuery.graphql";


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
            seriesByOpencastId(id: $id) {
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
            render={({ seriesByOpencastId: series }) => {
                if (!series) {
                    return <NotFound kind="series" />;
                }

                const { t } = useTranslation();

                return <>
                    <PageTitle title={series.title} />
                    <p>{series.description}</p>
                    <SeriesBlockFromSeries
                        title={t("series.videos.heading")}
                        basePath="/!v"
                        fragRef={series}
                    />
                </>;
            }}
        />,
        dispose: () => queryRef.dispose(),
    };
});
