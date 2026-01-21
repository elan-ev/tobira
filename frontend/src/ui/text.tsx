import LinkifyIt from "linkify-it";


export const linkify = new LinkifyIt({ fuzzyLink: false, fuzzyEmail: false })
    .add("mailto:", null)
    .add("//", null);

export type Fragment = { type: "text", value: string }
    | { type: "link", url: string, text: string };

/** Detects links in the given text and returns a list of text/link fragments. */
export const autoLink = (s: string): Fragment[] => {
    const matches = linkify.match(s);
    if (!matches || matches.length === 0) {
        return [{ type: "text", value: s }];
    }

    const out: Fragment[] = [];
    let offset = 0;
    for (const match of matches) {
        // There is a text node before the link
        if (match.index > offset) {
            out.push({
                type: "text",
                value: s.slice(offset, match.index),
            });
        }

        // Push the actual link
        out.push({
            type: "link",
            url: match.url,
            text: match.text,
        });

        // We have dealt with everything until `match.lastIndex`.
        offset = match.lastIndex;
    }

    // Tail text
    if (offset < s.length) {
        out.push({
            type: "text",
            value: s.slice(offset),
        });
    }

    return out;
};
