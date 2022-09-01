import { ReactNode } from "react";
import { TFunction, useTranslation } from "react-i18next";
import { Theme } from "react-select";
import AsyncSelect from "react-select/async";


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
        isClearable
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
