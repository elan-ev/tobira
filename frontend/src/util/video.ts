
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
    startTime: Date | null;
    endTime: Date | null;
    hasEnded: boolean;
    hasStarted: boolean;
};

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
        startTime,
        endTime,
        hasStarted: startTime != null && startTime < new Date(),
        hasEnded: endTime != null && endTime < new Date(),
    };
};
