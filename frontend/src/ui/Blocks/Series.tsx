import { useTranslation } from "react-i18next";
import { graphql, readInlineData, useFragment } from "react-relay";

import { isSynced } from "../../util";
import type { Fields } from "../../relay";
import {
    SeriesBlockData$data, SeriesBlockData$key,
} from "./__generated__/SeriesBlockData.graphql";
import {
    SeriesBlockSeriesData$data,
    SeriesBlockSeriesData$key,
} from "./__generated__/SeriesBlockSeriesData.graphql";
import { Card } from "../Card";
import { VideoListBlock, VideoListBlockContainer, videoListEventFragment } from "./VideoList";
import { VideoListEventData$key } from "./__generated__/VideoListEventData.graphql";


// ==============================================================================================
// ===== Data plumbing components (no UI stuff)
// ==============================================================================================

type SharedProps = {
    basePath: string;
};

const blockFragment = graphql`
    fragment SeriesBlockData on SeriesBlock {
        series {
            ...SeriesBlockSeriesData
        }
        showTitle
        showMetadata
        order
        layout
    }
`;

const seriesFragment = graphql`
    fragment SeriesBlockSeriesData on Series {
        title
        # description is only queried to get the sync status
        syncedData { description }
        events { ...VideoListEventData }
    }
`;

type FromBlockProps = SharedProps & {
    fragRef: SeriesBlockData$key;
};

export const SeriesBlockFromBlock: React.FC<FromBlockProps> = ({ fragRef, ...rest }) => {
    const { t } = useTranslation();
    const { series, ...block } = useFragment(blockFragment, fragRef);
    return series == null
        ? <Card kind="error">{t("series.deleted-series-block")}</Card>
        : <SeriesBlockFromSeries fragRef={series} {...rest} {...block} />;
};

type BlockProps = Partial<Omit<Fields<SeriesBlockData$data>, "series">>;

type SharedFromSeriesProps = SharedProps & BlockProps & {
    title?: string;
    activeEventId?: string;
};

type FromSeriesProps = SharedFromSeriesProps & {
    fragRef: SeriesBlockSeriesData$key;
};

export const SeriesBlockFromSeries: React.FC<FromSeriesProps> = (
    { fragRef, ...rest },
) => {
    const series = useFragment(seriesFragment, fragRef);
    return <SeriesBlock series={series} {...rest} />;
};

type Props = SharedFromSeriesProps & {
    series: SeriesBlockSeriesData$data;
};

const SeriesBlock: React.FC<Props> = ({ series, ...props }) => {
    const { t } = useTranslation();
    const events = series.events.map(event => (
        readInlineData<VideoListEventData$key>(videoListEventFragment, event)
    ));

    if (!isSynced(series)) {
        const { title, layout } = props;
        return <VideoListBlockContainer showViewOptions={false} {...{ title, layout }}>
            {t("series.not-ready.text")}
        </VideoListBlockContainer>;
    }

    return <VideoListBlock
        initialLayout={props.layout}
        initialOrder={
            (props.order === "%future added value" ? undefined : props.order) ?? "NEW_TO_OLD"
        }
        allowOriginalOrder={false}
        title={props.title ?? (props.showTitle ? series.title : undefined)}
        description={(props.showMetadata && series.syncedData.description) || undefined}
        activeEventId={props.activeEventId}
        basePath={props.basePath}
        items={events}
    />;
};
