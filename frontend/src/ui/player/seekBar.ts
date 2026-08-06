import { Paella } from "@asicupv/paella-core";


/**
 * Makes tapping Paella 8's seek bar work in Firefox.
 *
 * Maps the pointer's x position onto the track and performs the seek action.
 * Similar to what is done for the volume slider (see `volumeSlider.ts`), but
 * less important imo.
 */

const seekBarHit = (e: PointerEvent) => {
    // Make sure that close hits don't miss.
    const indicator = e.target instanceof Element
        ? e.target.closest(".progress-indicator")
        : null;
    const slider = indicator?.querySelector<HTMLInputElement>("input[type=range]");
    if (!slider) {
        return null;
    }

    const { left, width } = slider.getBoundingClientRect();
    return { slider, ratio: Math.max(0, Math.min(1, (e.clientX - left) / width)) };
};

/**
 * Installs seek bar tap handler on the given player and returns a function to
 * remove it again.
 */
export const installSeekBarTapHandler = (player: Paella) => {
    const onPointerDown = (e: PointerEvent) => {
        const hit = seekBarHit(e);
        if (!hit) {
            return;
        }

        hit.slider.value = String(hit.ratio * Number(hit.slider.max));

        void player.videoContainer?.duration().then(duration => {
            void player.videoContainer?.setCurrentTime(hit.ratio * duration);
        });
    };

    const container = player.containerElement;
    container.addEventListener("pointerdown", onPointerDown);
    return () => container.removeEventListener("pointerdown", onPointerDown);
};
