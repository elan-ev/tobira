import { Paella } from "paella-core";
import { HotkeyCallback } from "react-hotkeys-hook";

import { ShortcutProps, SHORTCUTS, useShortcut } from "../Shortcuts";
import { FRAME_DURATION, SPEEDS } from "./consts";


export const PlayerShortcuts: React.FC<{ activePlayer: React.MutableRefObject<Paella | null> }> = ({
    activePlayer,
}) => <>
    {Object.entries(SHORTCUTS.player).forEach(([, shortcut]: [unknown, ShortcutProps]) => {
        const hotkeyCallback: HotkeyCallback = (event, handler) => {
            if (shortcut.playerCallback && activePlayer.current) {
                const playerCallback = shortcut.playerCallback(activePlayer.current);
                return playerCallback(event, handler);
            }
        };

        // eslint-disable-next-line react-hooks/rules-of-hooks
        useShortcut(
            shortcut.keys,
            hotkeyCallback,
            shortcut.options,
            [activePlayer.current],
        );
    })}
</>;


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
