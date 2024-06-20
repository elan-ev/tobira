import { useEffect, useState } from "react";
import { WithTooltip } from "@opencast/appkit";
import { useTranslation } from "react-i18next";
import i18n from "../i18n";


/**
 * Calculates the time difference between a given date and a moment
 * (which is typically the current time).
 * Returns both the time as number (i.e. 2.1234...)
 * and formatted string (i.e. "2 days ago").
 */
export const relativeDate = (date: Date, moment: number): [number, string] => {
    const secsAgo = Math.floor((moment - date.getTime()) / 1000);
    const secsDiff = Math.abs(secsAgo);

    const MINUTE = 60;
    const HOUR = 60 * MINUTE;
    const DAY = 24 * HOUR;
    const WEEK = 7 * DAY;
    const MONTH = 30.5 * DAY;
    const YEAR = 365.25 * DAY;

    let timeAndUnit: [number, Intl.RelativeTimeFormatUnit];
    if (secsDiff <= 55) {
        timeAndUnit = [secsAgo, "second"];
    } else if (secsDiff <= 55 * MINUTE) {
        timeAndUnit = [secsAgo / MINUTE, "minute"];
    } else if (secsDiff <= 23 * HOUR) {
        timeAndUnit = [secsAgo / HOUR, "hour"];
    } else if (secsDiff <= 6 * DAY) {
        timeAndUnit = [secsAgo / DAY, "day"];
    } else if (secsDiff <= 3.5 * WEEK) {
        timeAndUnit = [secsAgo / WEEK, "week"];
    } else if (secsDiff <= 11 * MONTH) {
        timeAndUnit = [secsAgo / MONTH, "month"];
    } else {
        timeAndUnit = [secsAgo / YEAR, "year"];
    }

    const [time, unit] = timeAndUnit;
    const intl = new Intl.RelativeTimeFormat(i18n.language);
    const relative = intl.format(Math.round(-time), unit);

    return [time, relative];
};

type RelativeDateProps = {
    date: Date;
    isLive: boolean;
    noTooltip?: boolean;
};

/**
 * Formats a date as something relative like "3 days ago"
 * or "Started 3 days ago" in case of live events.
 */
export const RelativeDate: React.FC<RelativeDateProps> = ({ date, isLive, noTooltip = false }) => {
    const { t, i18n } = useTranslation();
    const [now, setNow] = useState(Date.now());
    const secsAgo = Math.floor((now - date.getTime()) / 1000);

    // We rerender this component regularly so that it's basically always up to
    // date. Most dates are more than a couple minutes in the past, and for
    // those we only update every 30 seconds to reduce CPU usage minimally.
    useEffect(() => {
        const intervalLength = secsAgo > 2 * 60 ? 30000 : 1000;
        const interval = setInterval(() => setNow(Date.now()), intervalLength);
        return () => clearInterval(interval);
    });

    const [time, relative] = relativeDate(date, now);
    const prefix = time < 0 ? "video.starts-in" : "video.started-when";

    const prettyDate = isLive ? t(prefix, { duration: relative }) : relative;
    const preciseDate = date.toLocaleString(i18n.language);

    return noTooltip
        ? <time dateTime={date.toISOString()}>{prettyDate}</time>
        : <WithTooltip tooltip={preciseDate} placement="bottom" distance={2}>
            <time dateTime={date.toISOString()}>{prettyDate}</time>
        </WithTooltip>;
};

