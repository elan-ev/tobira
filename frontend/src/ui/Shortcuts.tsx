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
import {
    KeyCombinationContainer, match, ShortcutGroupOverview, SingleKeyContainer,
} from "@opencast/appkit";
import TabIcon from "@opencast/appkit/dist/icons/tab-key.svg";

import { Modal, ModalHandle } from "./Modal";
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
                width: "80%",
                maxWidth: 1000,
                "& > div": {
                    maxHeight: "80vh",
                    overflow: "auto",
                },
            }}
        >
            {groups.map(group => <ShortcutGroupOverview
                key={group}
                alternativeSeparator={t("shortcuts.sequence-separator")}
                title={t(`shortcuts.${group}.title`)}
                shortcuts={Object.values(SHORTCUTS[group]).map((shortcut: ShortcutProps) => ({
                    label: typeof shortcut.translation === "string"
                        ? t(shortcut.translation)
                        : t(shortcut.translation.key, shortcut.translation.options),
                    combinations: shortcut.keys.split(";").map((combination, i) => (
                        <ShortcutKeys key={i} shortcut={combination.trim()} />
                    )),
                }))}
            />)}
        </Modal>
    );
};


const ShortcutKeys: React.FC<{ shortcut: string }> = ({ shortcut }) => {
    const { t } = useTranslation();

    return <KeyCombinationContainer>
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
            return <SingleKeyContainer key={i} css={key === "l" ? { fontFamily: "monospace" } : {}}>
                {child}
            </SingleKeyContainer>;
        })}
    </KeyCombinationContainer>;
};

export const useShortcut = (
    keys: string,
    callback: HotkeyCallback,
    options: Omit<Options, "delimiter"> = {},
    deps: unknown[] = [],
) => useHotkeys(keys, callback, { delimiter: ";", ...options }, deps);
