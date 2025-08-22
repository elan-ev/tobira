import React from "react";
import { useTranslation } from "react-i18next";
import { Options, useHotkeys, HotkeyCallback } from "react-hotkeys-hook";
import {
    LuArrowBigUp,
    LuArrowLeft,
    LuArrowRight,
    LuArrowDown,
    LuArrowUp,
} from "react-icons/lu";
import { match, screenWidthAtMost, useColorScheme } from "@opencast/appkit";
import TabIcon from "@opencast/appkit/dist/icons/tab-key.svg";

import { Modal, ModalHandle } from "./Modal";
import { COLORS } from "../color";
import { SKIP_INTERVAL } from "./player/consts";
import { TranslationKey } from "../i18n";


export type ShortcutProps = {
    keys: string,
    translation: TranslationKey | { key: TranslationKey; options?: Record<string, unknown> };
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
            keys: "s; /",
            translation: "shortcuts.general.search",
        },
        // Todo: add other shortcuts, i.e. for language selection and color scheme?
    },
    player: {
        play: {
            keys: "k; space",
            translation: "shortcuts.player.play",
        },
        mute: {
            keys: "m",
            translation: "shortcuts.player.mute",
        },
        captions: {
            keys: "c",
            translation: "shortcuts.player.captions",
        },
        fullscreen: {
            keys: "f",
            translation: "shortcuts.player.fullscreen",
        },
        rewind: {
            keys: "j; left",
            translation: {
                key: "shortcuts.player.rewind",
                options: { seconds: SKIP_INTERVAL },
            },
        },
        fastForward: {
            keys: "l; right",
            translation: {
                key: "shortcuts.player.fast-forward",
                options: { seconds: SKIP_INTERVAL },
            },
        },
        frameBackward: {
            keys: "comma",
            translation: "shortcuts.player.frame-backward",
        },
        frameForward: {
            keys: "period",
            translation: "shortcuts.player.frame-forward",
        },
        volumeDown: {
            keys: "shift+down",
            translation: "shortcuts.player.volume-down",
        },
        volumeUp: {
            keys: "shift+up",
            translation: "shortcuts.player.volume-up",
        },
        slowDown: {
            keys: "shift+comma",
            translation: "shortcuts.player.slow-down",
        },
        speedUp: {
            keys: "shift+period",
            translation: "shortcuts.player.speed-up",
        },
    },
} as const satisfies Record<string, Record<string, ShortcutProps>>;


export const ShortcutsOverview: React.FC<{ modalRef: React.RefObject<ModalHandle> }> = ({
    modalRef,
}) => {
    const { t } = useTranslation();
    const groups: (keyof typeof SHORTCUTS)[] = ["general", "player"];

    return (
        <Modal
            className="disable-background-scroll"
            ref={modalRef}
            title={t("shortcuts.title")}
            closeOnOutsideClick
            css={{
                maxWidth: 1000,
                "& > div": {
                    maxHeight: "80vh",
                    overflow: "auto",
                },
            }}
        >
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
                                [screenWidthAtMost(1000)]: {
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
                                {typeof shortcut.translation === "string"
                                    ? t(shortcut.translation)
                                    : t(shortcut.translation.key, shortcut.translation.options)}
                            </div>
                            <div css={{ display: "flex", gap: 8, alignItems: "center" }}>
                                {shortcut.keys.split(";").map((combination: string, i: number) =>
                                    <React.Fragment key={i}>
                                        {i > 0 && t("shortcuts.sequence-separator")}
                                        <ShortcutKeys shortcut={combination.trim()} />
                                    </React.Fragment>)
                                }
                            </div>
                        </div>)}
                    </div>
                </section>
            ))}
        </Modal>
    );
};


const ShortcutKeys: React.FC<{ shortcut: string }> = ({ shortcut }) => {
    const { t } = useTranslation();

    return <div css={{ display: "flex", alignItems: "center", gap: 4, color: COLORS.neutral70 }}>
        {shortcut.split("+").map((key, i) => {
            const child = match(key, {
                "escape": () => <>{t("shortcuts.keys.escape")}</>,
                "space": () => <>{t("shortcuts.keys.space")}</>,
                "period": () => <>.</>,
                "comma": () => <>,</>,
                "up": () => <LuArrowUp />,
                "down": () => <LuArrowDown />,
                "left": () => <LuArrowLeft />,
                "right": () => <LuArrowRight />,
                "shift": () => <>{t("shortcuts.keys.shift")}<LuArrowBigUp /></>,
                "tab": () => <>{t("shortcuts.keys.tab")}<TabIcon /></>,
            }) ?? <>{key}</>;
            return (
                <React.Fragment key={shortcut + key}>
                    {i !== 0 && "+"}
                    <SingleKey monofont={key === "l"}>{child}</SingleKey>
                </React.Fragment>
            );
        })}
    </div>;
};


type SingleKeyProps = React.PropsWithChildren<{
  /** Whether to use `monospace` font for this one. Basically only useful for lowercase l. */
  monofont: boolean;
}>;

const SingleKey: React.FC<SingleKeyProps> = ({ monofont, children }) => {
    const isLight = useColorScheme().scheme === "light";

    return (
        <div css={{
            border: `1px solid ${COLORS.neutral50}`,
            borderRadius: 4,
            padding: "2px 6px",
            display: "flex",
            alignItems: "center",
            justifyContent: "center",
            height: 36,
            minWidth: 36,
            fontSize: 16,
            boxShadow: "0 0 6px var(--shadow-color)",
            backgroundColor: isLight ? COLORS.neutral05 : COLORS.neutral15,
            color: isLight ? COLORS.neutral80 : COLORS.neutral90,
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
