import { ReactNode, useState } from "react";
import { useTranslation } from "react-i18next";
import { graphql } from "react-relay";
import { SingleValue } from "react-select";
import { TFunction } from "i18next";
import { Card } from "@opencast/appkit";

import {
    VideoEditModeBlockData$data,
} from "../routes/manage/Realm/Content/Edit/EditMode/__generated__/VideoEditModeBlockData.graphql";
import { SearchableSelect, DerivedProps as SelectProps } from "./SearchableSelect";
import { EventSelectorQuery } from "./__generated__/EventSelectorQuery.graphql";
import { ErrorDisplay } from "../util/err";
import { MovingTruck } from "./Waiting";
import { Creators, Thumbnail } from "./Video";
import { ellipsisOverflowCss } from ".";
import { fetchQuery } from "../relay";


type AuthorizedEvent = Extract<
    VideoEditModeBlockData$data["event"],
    { __typename: "AuthorizedEvent" }
>;
type Option = Omit<AuthorizedEvent, "__typename">;

type EventSelectorProps = SelectProps<Option> & {
    onChange: (option?: SingleValue<Option>) => void;
    onBlur?: () => void;
    defaultValue?: Option;
    writableOnly?: boolean;
    additionalOptions?: {
        excludeSeriesMembers?: boolean;
        excludedIds?: string[];
    };
};

export const EventSelector = ({
    onChange,
    onBlur,
    defaultValue,
    additionalOptions,
    writableOnly = false,
    ...props
}: EventSelectorProps) => {
    const { t } = useTranslation();
    const [error, setError] = useState<ReactNode>(null);

    const query = graphql`
        query EventSelectorQuery(
            $q: String!,
            $excludeSeriesMembers: Boolean = false,
            $excludedIds: [String!] = [],
            $writableOnly: Boolean!,
        ) {
            events: searchAllEvents(
                query: $q,
                writableOnly: $writableOnly,
                excludeSeriesMembers: $excludeSeriesMembers,
                excludedIds: $excludedIds,
            ) {
                ... on EventSearchResults {
                    items {
                        id
                        title
                        seriesId
                        seriesTitle
                        creators
                        thumbnail
                        isLive
                        created
                        duration
                        startTime
                        endTime
                        audioOnly
                        description
                    }
                }
            }
        }
    `;

    const loadEvents = (input: string, callback: (options: readonly Option[]) => void) => {
        fetchQuery<EventSelectorQuery>(query, {
            q: input,
            writableOnly,
            ...additionalOptions,
        }).subscribe({
            next: ({ events }) => {
                if (events.items === undefined) {
                    setError(t("search.unavailable"));
                    return;
                }

                callback(events.items.map(item => ({
                    ...item,
                    // Events returned by the search API have a different ID
                    // prefix than other events. And the mutation expects an ID
                    // starting with `ev`.
                    id: item.id.replace(/^es/, "ev"),
                    syncedData: item,
                    authorizedData: item,
                    description: item.description,
                    series: (item.seriesTitle == null || item.seriesId == null) ? null : {
                        id: item.seriesId,
                        title: item.seriesTitle,
                    },
                })));
            },
            start: () => {},
            error: (error: Error) => setError(<ErrorDisplay error={error} />),
        });
    };

    return <>
        {error && <Card kind="error" css={{ marginBottom: 8 }}>{error}</Card>}
        <SearchableSelect
            {...props}
            autoFocus
            loadOptions={loadEvents}
            format={formatOption}
            onChange={selectedEvent => onChange(selectedEvent)}
            isDisabled={!!error}
            {...{ onBlur, defaultValue }}
        />
    </>;
};

const formatOption = (event: Option, t: TFunction) => (
    <div key={event.id} css={{ display: "flex", gap: 16, padding: "4px 0" }}>
        {event.syncedData === null
            ? <MovingTruck />
            : <Thumbnail
                css={{ width: 120, minWidth: 120 }}
                event={event}
            />}
        <div css={{ display: "grid" }}>
            <div css={{ ...ellipsisOverflowCss(1) }}>{event.title}</div>
            <Creators creators={event.creators} />
            {event.series?.title && <div css={{ fontSize: 14 }}>
                <i>{t("series.singular")}</i>{": "}
                {event.series?.title}
            </div>}
        </div>
    </div>
);
