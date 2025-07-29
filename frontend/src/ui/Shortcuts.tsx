import React from "react";
import { useTranslation } from "react-i18next";
import { Options, useHotkeys, HotkeyCallback } from "react-hotkeys-hook";
import { LuArrowRightToLine } from "react-icons/lu";
import { match, screenWidthAtMost, useColorScheme } from "@opencast/appkit";
import { ParseKeys } from "i18next";

import { Modal, ModalHandle } from "./Modal";
import { COLORS } from "../color";


export type ShortcutProps = {
    keys: string,
    translation: ParseKeys,
}

export const SHORTCUTS = {
    general: {
        showOverview: {
            keys: "?",
            translation: "shortcuts.general.show-overview",
        },
        closeModal: {
            keys: "escape",
            translation: "shortcuts.general.close-modal",
        },
        tab: {
            keys: "tab",
            translation: "shortcuts.general.tab",
        },
        search: {
            keys: "s",
            translation: "shortcuts.general.search",
        },
    },
} as const satisfies Record<string, Record<string, ShortcutProps>>;


export const ShortcutsOverview: React.FC<{ modalRef: React.RefObject<ModalHandle> }> = ({
    modalRef,
}) => {
    const { t } = useTranslation();
    const groups: (keyof typeof SHORTCUTS)[] = ["general"];
    return <Modal ref={modalRef} title={t("shortcuts.title")} closeOnOutsideClick>
        {groups.map(group => (
            <section key={group} css={{
                margin: "32px 0",
                ":first-of-type": {
                    marginTop: 16,
                },
            }}>
                <h2 css={{ fontSize: 18, marginBottom: 8 }}>
                    {t(`shortcuts.${group}.title`)}
                </h2>
                <div css={{ display: "flex", flexWrap: "wrap", gap: 12 }}>
                    {Object.entries(SHORTCUTS[group]).map((
                        [name, shortcut]: [string, ShortcutProps],
                    ) => <div
                        key={group + name}
                        css={{
                            width: "calc(33.33% - 24px / 3)",
                            [screenWidthAtMost(1080)]: {
                                width: "calc(50% - 12px / 2)",
                            },
                            [screenWidthAtMost(720)]: {
                                width: "100%",
                            },
                            backgroundColor: COLORS.neutral10,
                            borderRadius: 4,
                            padding: "10px 16px",
                            display: "inline-flex",
                            flexDirection: "column",
                            alignItems: "start",
                            gap: 8,
                        }}
                    >
                        <div css={{ overflowWrap: "anywhere" }}>
                            {t(shortcut.translation)}
                        </div>
                        <div css={{ display: "flex", gap: 8, alignItems: "center" }}>
                            {shortcut.keys.split(";").map((combination: string, i: number) =>
                                <React.Fragment key={i}>
                                    {i > 0 && t("shortcuts.sequence-separator")}
                                    <ShortcutKeys shortcut={combination.trim()} large />
                                </React.Fragment>)
                            }
                        </div>
                    </div>)}
                </div>
            </section>
        ))}
    </Modal>;
};


type ShortcutKeysProps = {
  shortcut: string;
  large?: boolean;
};

export const ShortcutKeys: React.FC<ShortcutKeysProps> = ({ shortcut, large = false }) => {
    const { t } = useTranslation();

    return <div css={{ display: "flex", alignItems: "center", gap: 4, color: COLORS.neutral70 }}>
        {shortcut.split("+").map((key, i) => {
            const child = match(key, {
                "escape": () => <>{t("shortcuts.keys.escape")}</>,
                "tab": () => <LuArrowRightToLine size={20} title={key} />,
            }) ?? <>{key}</>;
            return (
                <React.Fragment key={shortcut + key}>
                    {i !== 0 && "+"}
                    <SingleKey large={large} monofont={key === "l"}>{child}</SingleKey>
                </React.Fragment>
            );
        })}
    </div>;
};


type SingleKeyProps = React.PropsWithChildren<{
  large: boolean;
  /** Whether to use `monospace` font for this one. Basically only useful for lowercase l. */
  monofont: boolean;
}>;

const SingleKey: React.FC<SingleKeyProps> = ({ large, monofont, children }) => {
    const isLight = useColorScheme().scheme === "light";

    const bg = isLight ? COLORS.neutral05 : COLORS.neutral15;

    return (
        <div css={{
            border: `1px solid ${COLORS.neutral50}`,
            borderRadius: 4,
            padding: "2px 6px",
            display: "flex",
            alignItems: "center",
            justifyContent: "center",
            height: large ? 36 : 30,
            minWidth: large ? 36 : 30,
            fontSize: 16,
            boxShadow: "0 0 6px var(--shadow-color)",
            backgroundColor: large ? bg : COLORS.neutral10,
            color: (isLight || !large) ? COLORS.neutral80 : COLORS.neutral90,
            cursor: "default",
            ...monofont && { fontFamily: "monospace" },
        }}>
            {children}
        </div>
    );
};


export const useShortcut = (
    keys: string,
    callback: HotkeyCallback,
    options: Omit<Options, "delimiter"> = {},
    deps: unknown[] = [],
) => useHotkeys(keys, callback, { delimiter: ";", ...options }, deps);
