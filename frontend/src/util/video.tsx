
type EventWithTimeInfo = {
    created: string;
    syncedData: {
        updated: string;
        startTime: string | null;
        endTime: string | null;
    };
};

type TimeInfo = {
    created: Date;
    updated: Date;
} & (
    { hasStarted: boolean; startTime: Date }
    | { hasStarted: null; startTime: null }
) & (
    { hasEnded: boolean; endTime: Date }
    | { hasEnded: null; endTime: null }
);

/** Converts the string dates into real `Date` objects and adds useful time information. */
export const getEventTimeInfo = (event: EventWithTimeInfo): TimeInfo => {
    const created = new Date(event.created);
    const updated = new Date(event.syncedData.updated);
    const startTime = event.syncedData.startTime == null
        ? null
        : new Date(event.syncedData.startTime);
    const endTime = event.syncedData.endTime == null
        ? null
        : new Date(event.syncedData.endTime);

    return {
        created,
        updated,
        ...startTime == null
            ? { startTime, hasStarted: null }
            : { startTime, hasStarted: startTime < new Date() },
        ...endTime == null
            ? { endTime, hasEnded: null }
            : { endTime, hasEnded: endTime < new Date() },
    };
};

type DescriptionProps = {
    text: string | null;
    className?: string;
};

/** Display an event's or series' description. */
export const Description: React.FC<DescriptionProps> = ({ text, className }) => {
    if (text === null) {
        return null;
    }

    const stripped = text.trim();
    if (stripped === "") {
        return null;
    }

    // We split the whole description by empty lines (two or more consecutive
    // newlines). That's the typical "make paragraphs from text" algorithm also
    // used by Markdown. However, we capture those newlines to be able to
    // output any extra (in addition to two) newlines. If a user typed many
    // newlines in their description, they probably want to have more space
    // there. The newlines between and within the paragraphs are then displayed
    // via `white-space: pre-line` below.
    const paragraphs = stripped.split(/(\n{2,})/);

    // TODO: auto link URL-like things?
    return (
        <div {...{ className }} css={{
            lineHeight: "1.43em",
            whiteSpace: "pre-line",
            "& > p:not(:first-child)": {
                marginTop: 8,
            },
        }}>
            {paragraphs.map((s, i) => i % 2 === 0
                ? <p key={i}>{s}</p>
                : s.slice(2))}
        </div>
    );
};
