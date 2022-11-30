import { useEffect, useState } from "react";
import { useTranslation } from "react-i18next";


type RelativeDateProps = {
    date: Date;
    isLive?: boolean;
};

/** 
 * Formats a date as something relative like "3 days ago" 
 * or "Live for 3 days" in case of live events.
 */
export const RelativeDate: React.FC<RelativeDateProps> = ({ date, isLive }) => {
    const { i18n } = useTranslation();
    const [now, setNow] = useState(Date.now());
    const secsAgo = Math.floor((now - date.getTime()) / 1000);
    const secsDiff = Math.abs(secsAgo);
    const intl = new Intl.RelativeTimeFormat(i18n.language);
    const { t } = useTranslation();

    // We rerender this component regularly so that it's basically always up to
    // date. Most dates are more than a couple minutes in the past, and for
    // those we only update every 30 seconds to reduce CPU usage minimally.
    useEffect(() => {
        const intervalLength = secsAgo > 2 * 60 ? 30000 : 1000;
        const interval = setInterval(() => setNow(Date.now()), intervalLength);
        return () => clearInterval(interval);
    });


    const MINUTE = 60;
    const HOUR = 60 * MINUTE;
    const DAY = 24 * HOUR;
    const WEEK = 7 * DAY;
    const MONTH = 30.5 * DAY;
    const YEAR = 365.25 * DAY;

    const liveDate = ((time: number, unit: Intl.RelativeTimeFormatUnit) => {
        const parts = intl.formatToParts(time, unit);
        return String(parts[1].value) + parts[2].value;
    });

    const prettyDate = (() => {
        let time: number;
        let unit: Intl.RelativeTimeFormatUnit;
        if (secsDiff <= 55) {
            time = secsAgo;
            unit = "second";
        } else if (secsDiff <= 55 * MINUTE) {
            time = Math.round(secsAgo / MINUTE);
            unit = "minute";
        } else if (secsDiff <= 23 * HOUR) {
            time = Math.round(secsAgo / HOUR);
            unit = "hour";
        } else if (secsDiff <= 6 * DAY) {
            time = Math.round(secsAgo / DAY);
            unit = "day";
        } else if (secsDiff <= 3.5 * WEEK) {
            time = Math.round(secsAgo / WEEK);
            unit = "week";
        } else if (secsDiff <= 11 * MONTH) {
            time = Math.round(secsAgo / MONTH);
            unit = "month";
        } else {
            time = Math.round(secsAgo / YEAR);
            unit = "year";
        }
        return isLive
            ? t("video.live-since") + " " + liveDate(time, unit)
            : intl.format(-time, unit);
    })();

    const preciseDate = date.toLocaleString(i18n.language);

    return <time
        dateTime={date.toISOString()}
        title={preciseDate}
    >{prettyDate}</time>;
};

