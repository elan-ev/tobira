import { useTranslation } from "react-i18next";
import { Card } from "@opencast/appkit";
import { graphql, useFragment } from "react-relay";

import { isSynced, keyOfId } from "../../util";
import type { Fields } from "../../relay";
import {
    SeriesBlockData$data, SeriesBlockData$key,
} from "./__generated__/SeriesBlockData.graphql";
import {
    SeriesBlockSeriesData$data,
    SeriesBlockSeriesData$key,
} from "./__generated__/SeriesBlockSeriesData.graphql";
import { VideoListBlock, VideoListBlockContainer } from "./VideoList";


// ==============================================================================================
// ===== Data plumbing components (no UI stuff)
// ==============================================================================================

type SharedProps = {
    realmPath: string | null;
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
        id
        title
        created
        description
        state
        metadata
        entries {
            __typename
            ...on AuthorizedEvent { id, ...VideoListEventData }
            ...on NotAllowed { dummy }
        }
    }
`;

type FromBlockProps = SharedProps & {
    fragRef: SeriesBlockData$key;
    edit?: boolean;
};

export const SeriesBlockFromBlock: React.FC<FromBlockProps> = ({ fragRef, ...rest }) => {
    const { t } = useTranslation();
    const { series, ...block } = useFragment(blockFragment, fragRef);

    return series == null && rest.edit
        ? <Card kind="error">{t("series.deleted-series-block")}</Card>
        : series != null && <SeriesBlockFromSeries fragRef={series} {...rest} {...block} />;
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

    if (!isSynced(series)) {
        const { title, layout } = props;
        return <VideoListBlockContainer showViewOptions={false} {...{ title, layout }}>
            {t("series.not-ready.text")}
        </VideoListBlockContainer>;
    }
    const creators = (() => {
        const raw = series.metadata?.dcterms?.creator;

        if (raw && Array.isArray(raw) && raw.length > 0 && typeof raw[0] === "string") {
            return raw;
        } else if (raw && typeof raw === "string") {
            return [raw];
        } else {
            return undefined;
        }
    })();

    const seriesKey = keyOfId(series.id);
    return <VideoListBlock
        initialLayout={props.layout}
        initialOrder={
            (props.order === "%future added value" ? undefined : props.order) ?? "NEW_TO_OLD"
        }
        allowOriginalOrder={false}
        title={props.title ?? (props.showTitle ? series.title : undefined)}
        description={(props.showMetadata && series.description) || undefined}
        timestamp={props.showMetadata ? series.created ?? undefined : undefined}
        creators={props.showMetadata ? creators : undefined}
        activeEventId={props.activeEventId}
        realmPath={props.realmPath}
        listEntries={series.entries}
        shareInfo={{
            shareUrl: props.realmPath == null
                ? `/!s/${seriesKey}`
                : `${props.realmPath.replace(/\/$/u, "")}/s/${seriesKey}`,
            rssUrl: `/~rss/series/${seriesKey}`,
        }}
    />;
};
