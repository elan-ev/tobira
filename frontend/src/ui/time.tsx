import { useTranslation } from "react-i18next";


type RelativeDateProps = {
    date: Date;
};

/** Formats a date as something relative like "3 days ago" */
export const RelativeDate: React.FC<RelativeDateProps> = ({ date }) => {
    const { i18n } = useTranslation();
    const secsAgo = Math.floor((Date.now() - date.getTime()) / 1000);

    const prettyDate = (() => {
        const intl = new Intl.RelativeTimeFormat(i18n.language);
        if (secsAgo <= 55) {
            return intl.format(-secsAgo, "second");
        } else if (secsAgo <= 55 * 60) {
            return intl.format(-Math.round(secsAgo / 60), "minute");
        } else if (secsAgo <= 23 * 60 * 60) {
            return intl.format(-Math.round(secsAgo / 60 / 60), "hour");
        } else if (secsAgo <= 6 * 24 * 60 * 60) {
            return intl.format(-Math.round(secsAgo / 24 / 60 / 60), "day");
        } else if (secsAgo <= 3.5 * 7 * 24 * 60 * 60) {
            return intl.format(-Math.round(secsAgo / 7 / 24 / 60 / 60), "week");
        } else if (secsAgo <= 11 * 30.5 * 24 * 60 * 60) {
            return intl.format(-Math.round(secsAgo / 30.5 / 24 / 60 / 60), "month");
        } else {
            return intl.format(-Math.round(secsAgo / 365.25 / 24 / 60 / 60), "year");
        }
    })();

    const preciseDate = date.toLocaleString(i18n.language);

    return <span title={preciseDate}>{prettyDate}</span>;
};

