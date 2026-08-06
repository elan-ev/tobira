import { Paella } from "@asicupv/paella-core";


/**
 * Hacky workaround for paella vol. 3:
 * The JS half of what we have to do ourselves to make Paella 8's volume control
 * behave the way we want. The CSS half sits with our other player styles in
 * `Paella.tsx`, marked "Volume slider".
 *
 * Paella renders that control as a plain native `<input type=range class="isu"
 * min=0 max=100>` (created by `es.upv.paella.volumeButtonPlugin` while the
 * player loads). Unlike the seek bar — a custom `.tracker`/`.elapsed`/
 * `.remaining` construct — it has therefore no notion of a filled portion, and
 * Paella offers no way to style one. Plus, the plugin has a handful of quirks
 * that make the control feel broken. All of the below works around one of those
 * two things, so all of it can hopefully be deleted again some day.
 */

const SLIDER_SELECTOR = "input[type=range].isu";

const findSlider = (player: Paella) =>
    player.containerElement.querySelector<HTMLInputElement>(SLIDER_SELECTOR);

const isSlider = (target: EventTarget | null): target is HTMLInputElement =>
    target instanceof HTMLInputElement && target.matches(SLIDER_SELECTOR);

/**
 * Fakes the filled part of the track for a slider value (0–100) with a two stop
 * gradient written into the variable Paella uses for the track background.
 */
const paintFill = (slider: HTMLInputElement, percent: number) => {
    const clamped = Math.max(0, Math.min(100, percent));
    slider.style.setProperty(
        "--range-runnable-track-background",
        `linear-gradient(to right, var(--color-player-accent-light) ${clamped}%, `
            + `var(--progress-indicator-remaining-color) ${clamped}%)`,
    );
};

/* Moves the slider to `percent` (0–100) and commits that as the new volume. */
const applyVolume = (player: Paella, slider: HTMLInputElement, percent: number) => {
    slider.value = String(percent);
    paintFill(slider, percent);
    void player.videoContainer?.setVolume(percent / 100);
};

/* Installs all volume slider handlers on the given player. */
export const installVolumeSlider = (player: Paella) => {
    // Repaint on volume changes that don't come from the slider, most notably
    // unmuting. Those set the slider's `value` property directly, which emits
    // no `input` event, so `onInput` below would leave the fill stale.
    player.bindEvent("paella:volumeChanged", ({ volume }: { volume: number }) => {
        const slider = findSlider(player);
        if (slider) {
            paintFill(slider, volume * 100);
        }
    });

    // Paint restored initial volume. That is applied before the plugin
    // creates the slider, so it apparently never reaches the handler above.
    // The plugin does write it into the fresh element though, so we just read it back.
    player.bindEvent("paella:playerLoaded", () => {
        const slider = findSlider(player);
        if (slider) {
            paintFill(slider, Number(slider.value));
        }
    });

    // Live updates while dragging. Paella itself only listens for `change`,
    // which fires when the drag ends.
    const onInput = (e: Event) => {
        if (isSlider(e.target)) {
            applyVolume(player, e.target, Number(e.target.value));
        }
    };

    // Tap/click-to-position.
    // This didn't work in Firefox (I think tap is swallowed because Paella blurs the slider on
    // `pointerup` before the click commits).
    // Paella 8 uses `::-moz-range-thumb` in FF, which doesn't support tap to click or sth,
    // but I'm not sure.
    const onPointerDown = (e: PointerEvent) => {
        if (!isSlider(e.target)) {
            return;
        }
        const { left, width } = e.target.getBoundingClientRect();
        if (width > 0) {
            applyVolume(player, e.target, (e.clientX - left) / width * 100);
        }
    };

    const container = player.containerElement;
    container.addEventListener("input", onInput);
    container.addEventListener("pointerdown", onPointerDown);
    return () => {
        container.removeEventListener("input", onInput);
        container.removeEventListener("pointerdown", onPointerDown);
    };
};
