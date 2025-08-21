import { Paella } from "paella-core";
import { HotkeyCallback, Options } from "react-hotkeys-hook";
import { useCallback } from "react";

import { SHORTCUTS, useShortcut } from "../Shortcuts";
import { FRAME_DURATION, SKIP_INTERVAL, SPEEDS } from "./consts";


export const isSpaceOnInteractiveElement = (e: KeyboardEvent): boolean => (
    e.key === " "
    && (e.target instanceof HTMLButtonElement || e.target instanceof HTMLInputElement)
);

type PlayerShortcuts = {
    callback: (activePlayer: Paella) => HotkeyCallback;
    options?: Options,
}
type PlayerAction = keyof typeof SHORTCUTS["player"];
export const SHORTCUT_ACTIONS = {
    play: {
        callback: player => async () => {
            const isPaused = await player.videoContainer.paused();
            if (isPaused) {
                await player.videoContainer.play();
            } else {
                await player.videoContainer.pause();
            }
        },
        options: {
            // Don't trigger when a button is focused. This way, users can still
            // use the space bar to control other elements by default.
            ignoreEventWhen: isSpaceOnInteractiveElement,
            // But still disable scrolling with space.
            preventDefault: true,
        },
    },
    mute: {
        callback: player => async () => {
            const vol = await player.videoContainer.volume();
            let newVol = 0;
            if (vol > 0) {
                player.videoContainer.lastVolume = vol;
                newVol = 0;
            } else {
                newVol = player.videoContainer.lastVolume || 1;
            }
            await player.videoContainer.setVolume(newVol);
        },
    },
    captions: {
        callback: player => () => {
            if (player.captionsCanvas.isVisible) {
                // TODO: cycle through captions before disabling?
                player.captionsCanvas.disableCaptions();
            } else {
                const availableCaptions = player.captionsCanvas.captions;
                if (availableCaptions && availableCaptions.length > 0) {
                    player.captionsCanvas.enableCaptions({ index: 0 });
                }
            }
        },
    },
    fullscreen: {
        callback: player => async () => {
            if (player.isFullscreen) {
                await player.exitFullscreen();
            } else {
                await player.enterFullscreen();
            }
        },
    },
    rewind: {
        callback: player => async () => {
            const currentTime = await player.videoContainer.currentTime();
            await player.videoContainer.setCurrentTime(
                Math.max(0, currentTime - SKIP_INTERVAL),
            );
        },
    },
    fastForward: {
        callback: player => async () => {
            const currentTime = await player.videoContainer.currentTime();
            await player.videoContainer.setCurrentTime(currentTime + SKIP_INTERVAL);
        },
    },
    frameBackward: {
        callback: player => async () => await jumpFrame(player, -1),
    },
    frameForward: {
        callback: player => async () => await jumpFrame(player, 1),
    },
    volumeDown: {
        callback: player => async () => {
            const currentVolume = await player.videoContainer.volume();
            await player.videoContainer.setVolume(
                Math.max(0, currentVolume - 0.1),
            );
        },
    },
    volumeUp: {
        callback: player => async () => {
            const currentVolume = await player.videoContainer.volume();
            await player.videoContainer.setVolume(
                Math.min(1, currentVolume + 0.1),
            );
        },
    },
    slowDown: {
        callback: player => async () => await adjustSpeed(player, -1),
    },
    speedUp: {
        callback: player => async () => await adjustSpeed(player, 1),
    },
} satisfies Record<PlayerAction, PlayerShortcuts>;


export const usePlayerShortcuts = (activePlayer: React.MutableRefObject<Paella | null>) => {
    // Since SHORTCUTS.player is static, the loop always iterates over
    // the same unchanging array and disabling the hook rule is safe.
    /* eslint-disable react-hooks/rules-of-hooks */
    for (const [key, shortcut] of Object.entries(SHORTCUTS.player)) {
        const action = SHORTCUT_ACTIONS[key as PlayerAction];
        const hotkeyCallback: HotkeyCallback = useCallback(() => {
            if (activePlayer.current) {
                const playerCallback = action.callback(activePlayer.current);
                playerCallback();
            }
        }, []);

        const options = "options" in action ? action.options : undefined;
        const ignoreEventWhen = useCallback((e: KeyboardEvent) => {
            if (!activePlayer.current) {
                return true;
            }
            return options?.ignoreEventWhen ? options.ignoreEventWhen(e) : false;
        }, []);

        useShortcut(
            shortcut.keys,
            hotkeyCallback,
            {
                ...options,
                ignoreEventWhen,
            },
        );
    }
    /* eslint-enable react-hooks/rules-of-hooks */
};

export const jumpFrame = async (
    player: Paella,
    direction: 1 | -1,
): Promise<void> => {
    if (await player.videoContainer.paused()) {
        const currentTime = await player.videoContainer.currentTime();
        const newTime = Math.max(0, currentTime + (direction * FRAME_DURATION));
        await player.videoContainer.setCurrentTime(newTime);
    }
};

export const adjustSpeed = async (
    player: Paella,
    direction: 1 | -1,
): Promise<void> => {
    const currentSpeed = await player.videoContainer.playbackRate();
    const idx = SPEEDS.indexOf(currentSpeed);
    if (idx === -1) {
        return;
    }
    const newIdx = Math.max(0, Math.min(SPEEDS.length - 1, idx + direction));
    const newSpeed = SPEEDS[newIdx];
    await player.videoContainer.setPlaybackRate(newSpeed);
};
