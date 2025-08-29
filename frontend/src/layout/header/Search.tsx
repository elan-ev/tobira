import React, { useRef, useCallback, useState } from "react";
import { useTranslation } from "react-i18next";
import { HiOutlineSearch } from "react-icons/hi";
import { ProtoButton, screenWidthAtMost } from "@opencast/appkit";
import { LuX } from "react-icons/lu";

import { useRouter } from "../../router";
import {
    SearchRoute,
    isSearchActive,
    isValidSearchItemType,
    SEARCH_TIMINGS,
} from "../../routes/Search";
import { focusStyle } from "../../ui";
import { currentRef } from "../../util";
import { BREAKPOINT as NAV_BREAKPOINT } from "../Navigation";
import { COLORS } from "../../color";
import { useUser } from "../../User";
import { SHORTCUTS, useShortcut } from "../../ui/Shortcuts";


type SearchFieldProps = {
    variant: "desktop" | "mobile";
};

export const SearchField: React.FC<SearchFieldProps> = ({ variant }) => {
    const { t } = useTranslation();
    const router = useRouter();
    const inputRef = useRef<HTMLInputElement>(null);

    // If the user is unknown, then we are still in the initial loading phase.
    // We don't want users to input anything into the search field in that
    // state, as their input would be ignored and discarded as soon as the
    // initial-loading phase is done.
    const disabled = useUser() === "unknown";

    useShortcut(
        SHORTCUTS.general.search.keys,
        () => inputRef.current?.focus(),
        {
            preventDefault: true,
            // Will cause infinite rerenders if not memoized, hence the `useCallback`.
            ignoreEventWhen: useCallback(
                () => /^input|textarea|select|button$/i.test(document.activeElement?.tagName ?? ""),
                [],
            ),
            useKey: true,
            ignoreModifiers: true,
        },
    );

    const onSearchRoute = isSearchActive();
    const getSearchParam = (searchParameter: string) => {
        const searchParams = new URLSearchParams(document.location.search);
        return onSearchRoute
            ? searchParams.get(searchParameter) ?? undefined
            : undefined;
    };
    const defaultValue = getSearchParam("q");

    const search = (q: string) => {
        if (!(q in SEARCH_TIMINGS)) {
            SEARCH_TIMINGS[q] = {};
        }
        SEARCH_TIMINGS[q].startSearch = window.performance.now();
        const filters = {
            itemType: isValidSearchItemType(getSearchParam("f")),
            start: getSearchParam("start"),
            end: getSearchParam("end"),
        };
        router.goto(SearchRoute.url({ query: q, ...filters }));
    };

    const clear = () => {
        const input = currentRef(inputRef);
        input.value = "";
        input.focus();
    };

    return <SearchInput
        {...{ search, inputRef, clear, defaultValue, variant }}
        inputProps={{
            disabled,
            placeholder: t("search.input-label"),
            // We only want to autofocus if the user just pressed
            // the search button in the header (mobile only). This
            // only happens on non-search routes.
            autoFocus: variant === "mobile" && !onSearchRoute,
        }}
    />;
};


type SearchInputProps = Partial<SearchFieldProps> & {
    search: (q: string) => void;
    inputRef: React.RefObject<HTMLInputElement>;
    clear: () => void;
    inputProps: React.InputHTMLAttributes<HTMLInputElement>;
    defaultValue?: string;
}

export const SearchInput: React.FC<SearchInputProps> = ({
    search,
    inputRef,
    clear,
    inputProps,
    defaultValue,
    variant,
}) => {
    const { t } = useTranslation();
    const [inputIsEmpty, setInputIsEmpty] = useState(!defaultValue);

    const handleClear = () => {
        clear();
        setInputIsEmpty(true);
    };

    const height = 42;
    const spinnerSize = 24;
    const paddingSpinner = (height - spinnerSize) / 2;


    return (
        <div css={{
            position: "relative",
            flex: 1,
            ...variant && { margin: "0 8px" },
            ...variant !== "mobile" && { maxWidth: 372 },
            ...variant === "desktop" && {
                [screenWidthAtMost(NAV_BREAKPOINT)]: {
                    display: "none",
                },
            },
        }}>
            <HiOutlineSearch css={{
                position: "absolute",
                height: "100%",
                left: 11,
                fontSize: 23,
                color: COLORS.neutral60,
            }} />
            <form onSubmit={event => {
                event.preventDefault();
                search(currentRef(inputRef).value);

                // Hide mobile keyboard on enter. The mobile keyboard hides lots
                // of results and intuitively, pressing "enter" on it should
                // close the keyboard. We don't want to remove focus for
                // desktop users though, since that doesn't do any good. The
                // check is not perfect but should actually detect virtual
                // keyboard very reliably.
                const visualHeight = window.visualViewport?.height;
                if (visualHeight && visualHeight < window.innerHeight) {
                    inputRef.current?.blur();
                }
            }}>
                <label css={{
                    display: "flex",
                    input: {
                        flex: 1,
                        color: COLORS.neutral60,
                        backgroundColor: COLORS.neutral05,
                        border: `1px solid ${COLORS.neutral40}`,
                        borderRadius: 4,
                        minWidth: 50,
                        height,
                        paddingLeft: 42,
                        paddingRight: 12,
                        ":hover": {
                            borderColor: COLORS.neutral25,
                            outline: `2.5px solid ${COLORS.neutral25}`,
                            outlineOffset: -1,
                        },
                        ":focus-visible": { borderColor: COLORS.focus },
                        ...focusStyle({ offset: -1 }),
                        "&::placeholder": {
                            color: COLORS.neutral60,
                            opacity: 1,
                        },
                    },
                }}>
                    <span css={{ display: "none" }}>{inputProps.placeholder}</span>
                    <input
                        ref={inputRef}
                        type="text"
                        defaultValue={defaultValue}
                        onChange={e => setInputIsEmpty(e.currentTarget.value.length === 0)}
                        {...inputProps}
                        css={{
                            flex: 1,
                            color: COLORS.neutral60,
                            backgroundColor: COLORS.neutral05,
                            border: `1px solid ${COLORS.neutral40}`,
                            borderRadius: 4,
                            minWidth: 50,
                            height,
                            paddingLeft: 42,
                            paddingRight: 12,
                            ":hover": {
                                borderColor: COLORS.neutral25,
                                outline: `2.5px solid ${COLORS.neutral25}`,
                                outlineOffset: -1,
                            },
                            ":focus-visible": { borderColor: COLORS.focus },
                            ...focusStyle({ offset: -1 }),
                            "&::placeholder": {
                                color: COLORS.neutral60,
                                opacity: 1,
                            },
                        }}
                    />
                </label>
            </form>
            {!inputIsEmpty && <ProtoButton
                aria-label={t("search.clear")}
                // Just clear the search input
                onClick={handleClear}
                css={{
                    ":hover, :focus": {
                        color: COLORS.neutral90,
                        borderColor: COLORS.neutral25,
                        outline: `2.5px solid ${COLORS.neutral25}`,
                    },
                    ...focusStyle({}),
                    borderRadius: 4,
                    color: COLORS.neutral60,
                    position: "absolute",
                    right: paddingSpinner,
                    top: paddingSpinner,
                }}
            >
                <LuX size={spinnerSize} css={{ display: "block" }} />
            </ProtoButton>}
        </div>
    );
};
