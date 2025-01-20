import { ReactNode, useState } from "react";
import { useTranslation } from "react-i18next";
import { TFunction } from "i18next";
import { CSSObjectWithLabel, Theme } from "react-select";
import AsyncSelect from "react-select/async";
import { fetchQuery, graphql, GraphQLTaggedNode } from "react-relay";
import { Card, useColorScheme } from "@opencast/appkit";

import { environment } from "../relay";
import { SmallDescription } from "./metadata";
import { ErrorDisplay } from "../util/err";
import { COLORS } from "../color";
import {
    SearchableSelectPlaylistsQuery,
} from "./__generated__/SearchableSelectPlaylistsQuery.graphql";
import {
    SearchableSelectSeriesQuery,
} from "./__generated__/SearchableSelectSeriesQuery.graphql";


type DerivedProps<T> = Omit<Parameters<typeof AsyncSelect<T>>[0],
    "theme"
    | "loadOptions"
    | "formatOptionLabel"
    | "loadingMessage"
>;

export type SearchableSelectProps<T> = DerivedProps<T> & {
    loadOptions: (input: string, callback: (options: readonly T[]) => void) => void;
    format: (option: T, t: TFunction) => ReactNode;
};

export const searchableSelectStyles = (isDark: boolean) => ({
    control: (baseStyles: CSSObjectWithLabel, state: { isFocused: boolean }) => ({
        ...baseStyles,
        backgroundColor: COLORS.neutral05,
        borderColor: state.isFocused ? COLORS.primary0 : COLORS.neutral40,
    }),
    input: (baseStyles: CSSObjectWithLabel) => ({
        ...baseStyles,
        ...isDark && { color: COLORS.neutral80 },
    }),
    placeholder: (baseStyles: CSSObjectWithLabel) => ({
        ...baseStyles,
        color: COLORS.neutral60,
    }),
    singleValue: (baseStyles: CSSObjectWithLabel) => ({
        ...baseStyles,
        color: COLORS.neutral90,
    }),
    menuList: (baseStyles: CSSObjectWithLabel) => ({
        ...baseStyles,
        padding: 0,
    }),
    menu: (baseStyles: CSSObjectWithLabel) => ({
        ...baseStyles,
        ...isDark && { outline: `1px solid ${COLORS.neutral20}` },
    }),
    option: (_baseStyles: CSSObjectWithLabel, state: {
        isSelected: boolean;
        isFocused: boolean;
    }) => ({
        cursor: "default",
        padding: "6px 10px",
        backgroundColor: isDark ? COLORS.neutral10 : COLORS.neutral05,
        ...state.isSelected && {
            borderLeft: `4px solid ${COLORS.focus}`,
        },
        ...(state.isFocused || state.isSelected) && {
            backgroundColor: isDark ? COLORS.neutral25 : COLORS.neutral10,
        },
    }),
    noOptionsMessage: (baseStyles: CSSObjectWithLabel) => ({
        ...baseStyles,
        ...isDark && { backgroundColor: COLORS.neutral10 },
    }),
    loadingMessage: (baseStyles: CSSObjectWithLabel) => ({
        ...baseStyles,
        ...isDark && { backgroundColor: COLORS.neutral10 },
    }),
});

/** A select input that can be searched. Basically a styled `react-select`. */
export const SearchableSelect = <T, >({
    loadOptions,
    format,
    noOptionsMessage,
    placeholder,
    ...props
}: SearchableSelectProps<T>) => {
    const { t } = useTranslation();
    const isDark = useColorScheme().scheme === "dark";

    return <AsyncSelect
        loadOptions={loadOptions}
        formatOptionLabel={(option: T) => format(option, t)}
        cacheOptions
        // Without this, it thinks all entries are selected if any one is.
        isOptionSelected={() => false}
        styles={searchableSelectStyles(isDark)}
        isClearable
        defaultOptions
        theme={theme}
        loadingMessage={() => t("general.loading")}
        noOptionsMessage={noOptionsMessage ?? (() => t("general.form.select.no-options"))}
        placeholder={placeholder ?? t("general.form.select.select-option")}
        {...props}
    />;
};

export const theme = (theme: Theme) => ({
    ...theme,
    colors: {
        ...theme.colors,
        danger: COLORS.danger0,
        primary: COLORS.primary0,
    },
});



type VideoListSelectorProps = DerivedProps<VideoListOption> & {
    onChange?: (videoList: VideoListOption | null) => void;
    onBlur?: () => void;
    defaultValue?: VideoListOption;
    writableOnly?: boolean;
    type: "playlist" | "series";
};

export type VideoListOption = {
    readonly id: string;
    readonly opencastId: string;
    readonly title: string;
    readonly description?: string | null;
};

export const VideoListSelector: React.FC<VideoListSelectorProps> = ({
    writableOnly = false, onBlur, onChange, defaultValue, inputId, type, ...rest
}) => {
    const { t } = useTranslation();
    const [error, setError] = useState<ReactNode>(null);

    const seriesQuery = graphql`
        query SearchableSelectSeriesQuery($q: String!, $writableOnly: Boolean!) {
            series: searchAllSeries(query: $q, writableOnly: $writableOnly) {
                ... on SeriesSearchResults {
                    items {
                        id
                        opencastId
                        title
                        description
                    }
                }
            }
        }
    `;

    const playlistsQuery = graphql`
        query SearchableSelectPlaylistsQuery($q: String!, $writableOnly: Boolean!) {
            playlists: searchAllPlaylists(query: $q, writableOnly: $writableOnly) {
                ... on PlaylistSearchResults {
                    items { id opencastId title description }
                }
            }
        }
    `;

    const makeLoader = <Q extends SearchableSelectSeriesQuery | SearchableSelectPlaylistsQuery>(
        query: GraphQLTaggedNode,
        prefix: "sr" | "pl",
    ) => ((
            input: string,
            callback: (options: readonly VideoListOption[]) => void,
        ) => {
            fetchQuery<Q>(environment, query, { q: input, writableOnly }).subscribe({
                next: r => {
                    const items = ("series" in r ? r.series : r.playlists).items;
                    if (items === undefined) {
                        setError(t("search.unavailable"));
                        return;
                    }
                    callback(items.map(item => ({
                        ...item,
                        id: item.id.replace(/^../, prefix),
                    })));
                },
                start: () => {},
                error: (error: Error) => setError(<ErrorDisplay error={error} />),
            });
        });
    const loadSeries = makeLoader<SearchableSelectSeriesQuery>(seriesQuery, "sr");
    const loadPlaylists = makeLoader<SearchableSelectPlaylistsQuery>(playlistsQuery, "pl");

    return <>
        {error && <Card kind="error" css={{ marginBottom: 8 }}>{error}</Card>}
        <SearchableSelect
            loadOptions={type === "series" ? loadSeries : loadPlaylists}
            format={formatVideoListOption}
            onChange={onChange}
            isDisabled={!!error}
            {...{ onBlur, defaultValue, inputId }}
            {...rest}
        />
    </>;
};

const formatVideoListOption = (videoList: VideoListOption, _: TFunction) => (
    <div>
        <div>{videoList.title}</div>
        <SmallDescription css={{ margin: 0 }} lines={1} text={videoList.description} />
    </div>
);
