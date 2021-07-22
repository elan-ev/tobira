import { bug } from "./err";


type Triplet = [number, number, number];

/**
 * Converts an RGB color to HSL. All components of input and output are between
 * 0 and 1.
 */
export const rgbToHsl = ([r, g, b]: Triplet): Triplet => {
    const max = Math.max(r, g, b);
    const min = Math.min(r, g, b);
    const range = max - min;

    const l = (max + min) / 2;
    const s = range === 0 ? 0 : range / (1 - Math.abs(2 * l - 1));

    let h;
    if (r === g && g === b) {
        h = 0;
    } else if (r > g && r > b) {
        h = (g - b) / range + (g < b ? 6 : 0);
    } else if (g > b) {
        h = (b - r) / range + 2;
    } else {
        h = (r - g) / range + 4;
    }
    h /= 6;

    return [h, s, l];
};

/**
 * Extracts the RGB values from a six digit hex code with leading `#`. Returned
 * values are between 0 and 1.
 */
export const hexCodeToRgb = (hex: string): Triplet => {
    if (hex.length !== 7) {
        bug("invalid color input");
    }

    const r = parseInt(hex.slice(1, 3), 16) / 255;
    const g = parseInt(hex.slice(3, 5), 16) / 255;
    const b = parseInt(hex.slice(5, 7), 16) / 255;

    return [r, g, b];
};

/**
 * Lightens or darkens the brightness value `l` according to `amount`. If
 * `amount` is positive, the lightness is brought `amount`% towards 1
 * (maximum). If it's negative, it's brought `-amount`% towards 0 (minimum).
 */
export const lighten = (l: number, amount: number): number => (
    amount > 0
        ? l + (1 - l) * (amount / 100)
        : l * (1 + amount / 100)
);

/**
 * Returns true if the contrast between the given color and black is higher than
 * the contrast between the given color and white. This can be used to
 * determine the best color for text on a background with the given color.
 */
export const prefersBlackText = (hex: string): boolean => {
    // The threshold of 0.6 is fairly arbitrary, but works well in practice. You
    // will find various thresholds in the internet.
    const [r, g, b] = hexCodeToRgb(hex);
    const luminance = r * 0.299 + g * 0.587 + b * 0.114;
    return luminance > 0.6;
};
