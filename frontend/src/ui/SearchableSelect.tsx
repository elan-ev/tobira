import { ReactNode, useState } from "react";
import { useTranslation } from "react-i18next";
import { TFunction } from "i18next";
import { Theme } from "react-select";
import AsyncSelect from "react-select/async";
import { fetchQuery, graphql } from "react-relay";

import { environment } from "../relay";
import { Card } from "./Card";
import { SmallDescription } from "./metadata";
import { SearchableSelectSeriesQuery } from "./__generated__/SearchableSelectSeriesQuery.graphql";
import { ErrorDisplay } from "../util/err";


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

/** A select input that can be searched. Basically a styled `react-select`. */
export const SearchableSelect = <T, >({
    loadOptions,
    format,
    noOptionsMessage,
    placeholder,
    ...props
}: SearchableSelectProps<T>) => {
    const { t } = useTranslation();

    return <AsyncSelect
        loadOptions={loadOptions}
        formatOptionLabel={(option: T) => format(option, t)}
        cacheOptions
        // Without this, it thinks all entries are selected if any one is.
        isOptionSelected={() => false}
        styles={{
            menuList: baseStyles => ({
                ...baseStyles,
                padding: 0,
            }),
            option: (_baseStyles, state) => ({
                cursor: "default",
                padding: "6px 10px",
                "&:hover, &:focus": {
                    backgroundColor: "var(--grey95)",
                },
                ...state.isSelected && {
                    borderLeft: "4px solid var(--accent-color)",
                },
                ...(state.isFocused || state.isSelected) && {
                    backgroundColor: "var(--grey95)",
                },
            }),
        }}
        isClearable
        defaultOptions
        theme={theme}
        loadingMessage={() => t("loading")}
        noOptionsMessage={noOptionsMessage ?? (() => t("general.form.select.no-options"))}
        placeholder={placeholder ?? t("general.form.select.select-option")}
        {...props}
    />;
};

const theme = (theme: Theme) => ({
    ...theme,
    colors: {
        ...theme.colors,
        danger: "var(--danger-color)",
        dangerLight: "hsla(var(--danger-hue), var(--danger-sat), var(--danger-lightness), 0.25)",
        primary: "var(--accent-color)",
        primary75: "hsla(var(--accent-hue), var(--accent-sat), var(--accent-lightness), 0.75)",
        primary50: "hsla(var(--accent-hue), var(--accent-sat), var(--accent-lightness), 0.50)",
        primary25: "hsla(var(--accent-hue), var(--accent-sat), var(--accent-lightness), 0.25)",
    },
});



type SeriesSelectorProps = DerivedProps<SeriesOption> & {
    onChange?: (series: SeriesOption | null) => void;
    onBlur?: () => void;
    defaultValue?: SeriesOption;
    writableOnly?: boolean;
};

type SeriesOption = {
    readonly id: string;
    readonly opencastId: string;
    readonly title: string;
    readonly description: string | null;
};

export const SeriesSelector: React.FC<SeriesSelectorProps> = ({
    writableOnly = false, onBlur, onChange, defaultValue, ...rest
}) => {
    const { t } = useTranslation();
    const [error, setError] = useState<ReactNode>(null);

    const query = graphql`
        query SearchableSelectSeriesQuery($q: String!, $writableOnly: Boolean!) {
            series: searchAllSeries(query: $q, writableOnly: $writableOnly) {
                ... on SeriesSearchResults {
                    items { id opencastId title description }
                }
            }
        }
    `;

    const load = (input: string, callback: (options: readonly SeriesOption[]) => void) => {
        fetchQuery<SearchableSelectSeriesQuery>(environment, query, { q: input, writableOnly })
            .subscribe({
                next: ({ series }) => {
                    if (series.items === undefined) {
                        setError(t("search.unavailable"));
                        return;
                    }

                    callback(series.items.map(item => ({
                        ...item,
                        // Series returned by the search API have a different ID
                        // prefix than other series. And the mutation expects an ID
                        // starting with `ev`.
                        id: item.id.replace(/^ss/, "sr"),
                    })));
                },
                start: () => {},
                error: (error: Error) => setError(<ErrorDisplay error={error} />),
            });
    };

    return <>
        {error && <Card kind="error" css={{ marginBottom: 8 }}>{error}</Card>}
        <SearchableSelect
            loadOptions={load}
            format={formatSeriesOption}
            onChange={onChange}
            isDisabled={!!error}
            {...{ onBlur, defaultValue }}
            {...rest}
        />
    </>;
};

const formatSeriesOption = (series: SeriesOption, _: TFunction) => (
    <div>
        <div>{series.title}</div>
        <SmallDescription css={{ margin: 0 }} lines={1} text={series.description} />
    </div>
);
