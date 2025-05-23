import React, { ReactNode, useState } from "react";
import { fetchQuery, graphql, useFragment, useMutation } from "react-relay";
import { useTranslation } from "react-i18next";
import { TFunction } from "i18next";
import { Controller, useFormContext } from "react-hook-form";
import { SingleValue } from "react-select";
import { Card } from "@opencast/appkit";

import { EditModeForm } from ".";
import { Heading } from "./util";
import type {
    VideoEditModeBlockData$data,
    VideoEditModeBlockData$key,
} from "./__generated__/VideoEditModeBlockData.graphql";
import type { VideoEditSaveMutation } from "./__generated__/VideoEditSaveMutation.graphql";
import type { VideoEditCreateMutation } from "./__generated__/VideoEditCreateMutation.graphql";
import {
    DerivedProps as SelectProps,
    SearchableSelect,
} from "../../../../../../ui/SearchableSelect";
import { Creators, Thumbnail } from "../../../../../../ui/Video";
import { environment } from "../../../../../../relay";
import { VideoEditModeSearchQuery } from "./__generated__/VideoEditModeSearchQuery.graphql";
import { MovingTruck } from "../../../../../../ui/Waiting";
import { ErrorDisplay } from "../../../../../../util/err";
import { DisplayOptionGroup } from "../../../../../../ui/Input";
import { InfoTooltip } from "../../../../../../ui";
import { isRealUser, useUser } from "../../../../../../User";


type VideoFormData = {
    event: string;
    showTitle: boolean;
    showLink: boolean;
};

type EditVideoBlockProps = {
    block: VideoEditModeBlockData$key;
};

export const EditVideoBlock: React.FC<EditVideoBlockProps> = ({ block: blockRef }) => {
    const { event, showTitle, showLink } = useFragment(graphql`
        fragment VideoEditModeBlockData on VideoBlock {
            event {
                __typename,
                ... on NotAllowed { dummy }
                ... on AuthorizedEvent {
                    id
                    title
                    series { id title }
                    created
                    isLive
                    creators
                    description
                    syncedData { thumbnail duration startTime endTime audioOnly }
                }
            }
            showTitle
            showLink
        }
    `, blockRef);


    const [save] = useMutation<VideoEditSaveMutation>(graphql`
        mutation VideoEditSaveMutation($id: ID!, $set: UpdateVideoBlock!) {
            updateVideoBlock(id: $id, set: $set) {
                ... VideoEditModeBlockData
                ... BlocksBlockData
                ... EditBlockUpdateRealmNameData
            }
        }
    `);

    const [create] = useMutation<VideoEditCreateMutation>(graphql`
        mutation VideoEditCreateMutation($realm: ID!, $index: Int!, $block: NewVideoBlock!) {
            addVideoBlock(realm: $realm, index: $index, block: $block) {
                ... ContentManageRealmData
            }
        }
    `);

    const { t } = useTranslation();
    const user = useUser();

    const form = useFormContext<VideoFormData>();
    const { formState: { errors } } = form;

    const currentEvent = event?.__typename === "AuthorizedEvent"
        ? {
            ...event,
            ...event.syncedData,
            seriesId: event.series?.id,
            seriesTitle: event.series?.title,
        }
        : undefined;

    return <EditModeForm create={create} save={save} map={(data: VideoFormData) => data}>
        <Heading>
            {t("manage.realm.content.event.event.heading")}
            {isRealUser(user) && !user.canFindUnlisted && <InfoTooltip
                info={t("manage.realm.content.event.event.findable-events-note")}
            />}
        </Heading>
        {"event" in errors && <div css={{ margin: "8px 0" }}>
            <Card kind="error">{t("manage.realm.content.event.event.invalid")}</Card>
        </div>}
        {event?.__typename === "NotAllowed" && <Card kind="error" css={{ margin: "8px 0" }}>
            {t("manage.realm.content.event.event.no-read-access-to-current")}
        </Card>}
        <Controller
            defaultValue={currentEvent?.id}
            name="event"
            rules={{ required: true }}
            render={({ field: { onChange, onBlur } }) => (
                <EventSelector
                    defaultValue={currentEvent}
                    {...{ onBlur }}
                    onChange={selectedEvent => onChange(selectedEvent?.id)}
                />
            )}
        />
        <DisplayOptionGroup type="checkbox" {...{ form }} optionProps={[
            {
                option: "showTitle",
                title: t("manage.realm.content.show-title"),
                checked: showTitle,
            },
            {
                option: "showLink",
                title: t("manage.realm.content.show-link"),
                checked: showLink,
            },
        ]} />
    </EditModeForm>;
};

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
        query VideoEditModeSearchQuery(
            $q: String!,
            $excludeSeriesMembers: Boolean!,
            $excludedIds: [String!]!,
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
        fetchQuery<VideoEditModeSearchQuery>(environment, query, {
            q: input,
            excludeSeriesMembers: additionalOptions?.excludeSeriesMembers ?? false,
            excludedIds: additionalOptions?.excludedIds ?? [],
            writableOnly,
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
        <div>
            <div>{event.title}</div>
            <Creators creators={event.creators} />
            {event.series?.title && <div css={{ fontSize: 14 }}>
                <i>{t("series.series")}</i>{": "}
                {event.series?.title}
            </div>}
        </div>
    </div>
);

type AuthorizedEvent = Extract<
    VideoEditModeBlockData$data["event"],
    { __typename: "AuthorizedEvent" }
>;
type Option = Omit<AuthorizedEvent, "__typename">;
