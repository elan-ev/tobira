
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
