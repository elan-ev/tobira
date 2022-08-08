import { useEffect, useState } from "react";
import { useTranslation } from "react-i18next";


type RelativeDateProps = {
    date: Date;
};

/** Formats a date as something relative like "3 days ago" */
export const RelativeDate: React.FC<RelativeDateProps> = ({ date }) => {
    const { i18n } = useTranslation();
    const [now, setNow] = useState(Date.now());
    const secsAgo = Math.floor((now - date.getTime()) / 1000);
    const secsDiff = Math.abs(secsAgo);

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

    const prettyDate = (() => {
        const intl = new Intl.RelativeTimeFormat(i18n.language);
        if (secsDiff <= 55) {
            return intl.format(-secsAgo, "second");
        } else if (secsDiff <= 55 * MINUTE) {
            return intl.format(-Math.round(secsAgo / MINUTE), "minute");
        } else if (secsDiff <= 23 * HOUR) {
            return intl.format(-Math.round(secsAgo / HOUR), "hour");
        } else if (secsDiff <= 6 * DAY) {
            return intl.format(-Math.round(secsAgo / DAY), "day");
        } else if (secsDiff <= 3.5 * WEEK) {
            return intl.format(-Math.round(secsAgo / WEEK), "week");
        } else if (secsDiff <= 11 * MONTH) {
            return intl.format(-Math.round(secsAgo / MONTH), "month");
        } else {
            return intl.format(-Math.round(secsAgo / YEAR), "year");
        }
    })();

    const preciseDate = date.toLocaleString(i18n.language);

    return <time
        dateTime={date.toISOString()}
        title={preciseDate}
    >{prettyDate}</time>;
};

