import { ReactNode, useState } from "react";
import { useTranslation } from "react-i18next";
import { TFunction } from "i18next";
import { CSSObjectWithLabel, Theme } from "react-select";
import AsyncSelect from "react-select/async";
import { fetchQuery, graphql } from "react-relay";
import { useColorScheme } from "@opencast/appkit";

import { environment } from "../relay";
import { Card } from "./Card";
import { SmallDescription } from "./metadata";
import { SearchableSelectSeriesQuery } from "./__generated__/SearchableSelectSeriesQuery.graphql";
import { ErrorDisplay } from "../util/err";
import { COLORS } from "../color";


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
        isSelected: boolean; isFocused: boolean;
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
