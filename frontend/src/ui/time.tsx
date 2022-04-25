import { useTranslation } from "react-i18next";


type RelativeDateProps = {
    date: Date;
};

/** Formats a date as something relative like "3 days ago" */
export const RelativeDate: React.FC<RelativeDateProps> = ({ date }) => {
    const { i18n } = useTranslation();
    const secsAgo = Math.floor((Date.now() - date.getTime()) / 1000);

    const MINUTE = 60;
    const HOUR = 60 * MINUTE;
    const DAY = 24 * HOUR;
    const WEEK = 7 * DAY;
    const MONTH = 30.5 * DAY;
    const YEAR = 365.25 * DAY;

    const prettyDate = (() => {
        const intl = new Intl.RelativeTimeFormat(i18n.language);
        if (secsAgo <= 55) {
            return intl.format(-secsAgo, "second");
        } else if (secsAgo <= 55 * MINUTE) {
            return intl.format(-Math.round(secsAgo / MINUTE), "minute");
        } else if (secsAgo <= 23 * HOUR) {
            return intl.format(-Math.round(secsAgo / HOUR), "hour");
        } else if (secsAgo <= 6 * DAY) {
            return intl.format(-Math.round(secsAgo / DAY), "day");
        } else if (secsAgo <= 3.5 * WEEK) {
            return intl.format(-Math.round(secsAgo / WEEK), "week");
        } else if (secsAgo <= 11 * MONTH) {
            return intl.format(-Math.round(secsAgo / MONTH), "month");
        } else {
            return intl.format(-Math.round(secsAgo / YEAR), "year");
        }
    })();

    const preciseDate = date.toLocaleString(i18n.language);

    return <span title={preciseDate}>{prettyDate}</span>;
};

