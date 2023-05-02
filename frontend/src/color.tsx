import React, { useContext, useState } from "react";
import { bug } from "./util/err";


/**
 * All colors used throughout Tobira. Higher numbers mean darker colors in light
 * mode and lighter colors in dark mode.
 */
export const COLORS = {
    primary0: "var(--color-primary0)",
    primary0BwInverted: "var(--color-primary0-bw-inverted)",
    primary1: "var(--color-primary1)",
    primary1BwInverted: "var(--color-primary1-bw-inverted)",
    primary2: "var(--color-primary2)",
    primary2BwInverted: "var(--color-primary2-bw-inverted)",

    danger0: "var(--color-danger0)",
    danger0BwInverted: "var(--color-danger0-bw-inverted)",
    danger1: "var(--color-danger1)",
    danger1BwInverted: "var(--color-danger1-bw-inverted)",

    happy0: "var(--color-happy0)",
    happy0BwInverted: "var(--color-happy0-bw-inverted)",
    happy1: "var(--color-happy1)",
    happy1BwInverted: "var(--color-happy1-bw-inverted)",
    happy2: "var(--color-happy2)",
    happy2BwInverted: "var(--color-happy2-bw-inverted)",

    grey0: "var(--color-grey0)",
    grey1: "var(--color-grey1)",
    grey2: "var(--color-grey2)",
    grey3: "var(--color-grey3)",
    grey4: "var(--color-grey4)",
    grey5: "var(--color-grey5)",
    grey6: "var(--color-grey6)",
    grey7: "var(--color-grey7)",

    background: "var(--color-background)",
    foreground: "var(--color-foreground)",

    // Additional aliases for colors set by the backend.
    focus: "var(--color-primary1)",
};


// ----- Color scheme context ------------------------------------------------------------

type ColorScheme = {
    scheme: "light" | "dark";
    isAuto: boolean;
    update: (pref: "light" | "dark" | "auto") => void;
};

const LOCAL_STORAGE_KEY = "tobiraColorScheme";

const ColorSchemeContext = React.createContext<ColorScheme | null>(null);

/** Returns current information about the color scheme and a way to change it. */
export const useColorScheme = (): ColorScheme => useContext(ColorSchemeContext)
    ?? bug("missing color scheme context provider");

export const ColorSchemeProvider: React.FC<React.PropsWithChildren> = ({ children }) => {
    // Retrieve the scheme that was selected when the page was loaded. This is
    // set inside `index.html`.
    const initialScheme = document.documentElement.dataset.colorScheme === "dark"
        ? "dark" as const
        : "light" as const;
    const [scheme, setScheme] = useState(initialScheme);

    // Next, check whether there are some preferences stored in local storage.
    const stored = window.localStorage.getItem(LOCAL_STORAGE_KEY);
    const [isAuto, setIsAuto] = useState(stored !== "dark" && stored !== "light");

    const context: ColorScheme = {
        scheme,
        isAuto,
        update: pref => {
            // Update preference in local storage
            window.localStorage.setItem(LOCAL_STORAGE_KEY, pref);

            // Update the two states `isAuto` and `scheme` (for other JS code),
            // but also the attribute on `<html>` (for CSS code).
            setIsAuto(pref === "auto");
            const scheme = (pref === "dark" || pref === "light")
                ? pref
                : (window.matchMedia("(prefers-color-scheme: dark)").matches ? "dark" : "light");
            setScheme(scheme);
            document.documentElement.dataset.colorScheme = scheme;
        },
    };

    return (
        <ColorSchemeContext.Provider value={context}>
            {children}
        </ColorSchemeContext.Provider>
    );
};
