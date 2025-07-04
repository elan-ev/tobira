import { useEffect, useState } from "react";
import { match, WithTooltip } from "@opencast/appkit";
import { useTranslation } from "react-i18next";
import type { i18n } from "i18next";


type PrettyDateCase = "rel-minutes" | "rel-day" | "weekday" | "date";

export const prettyDate = (
    date: Date,
    now: Date,
    i18n: i18n,
    alwaysShowTime = false,
): [string, PrettyDateCase] => {
    const locale = preferredLocaleForLang(i18n.language);
    const secsAgo = Math.floor((now.getTime() - date.getTime()) / 1000);
    const secsDiff = Math.abs(secsAgo);


    const prettyTime = () => date.toLocaleTimeString(locale, {
        hour: "numeric",
        minute: "2-digit",
    });

    let out: string;
    let kind: PrettyDateCase;
    if (secsDiff <= 60 * 60) {
        // ----- Less than an hour ago: show relative time in minutes
        const intl = new Intl.RelativeTimeFormat(locale);
        out = intl.format(-Math.ceil(secsAgo / 60), "minutes");
        kind = "rel-minutes";
    } else if (isSameDay(date, now)) {
        // ----- Today
        out = i18n.t("general.today-at", { time: prettyTime() });
        kind = "rel-day";
    } else if (isSameDay(date, daysLater(now, -1))) {
        // ----- Yesterday
        out = i18n.t("general.yesterday-at", { time: prettyTime() });
        kind = "rel-day";
    } else if (isSameDay(date, daysLater(now, 1))) {
        // ----- Tomorrow
        out = i18n.t("general.tomorrow-at", { time: prettyTime() });
        kind = "rel-day";
    } else if (isInCurrentWeek(date, now)) {
        // ----- Same week
        out = i18n.t("general.weekday-at", {
            weekday: date.toLocaleString(locale, { weekday: "long" }),
            time: prettyTime(),
        });
        kind = "weekday";
    } else {
        // ----- Older dates: just show date
        out = date.toLocaleString(locale, {
            year: "numeric",
            month: "short",
            day: "numeric",

            // We show the weekday when it's less than half a year ago. Weekday
            // is very useful for dates in the same semester, for example.
            weekday: secsDiff < 60 * 60 * 24 * 180 ? "short" : undefined,
        });

        // In German, remove the abbreviation points, which just add noise.
        if (locale === "de") {
            out = out.replaceAll(/([a-z])\./gi, "$1");
        }
        if (alwaysShowTime) {
            out = i18n.t("general.date-at", { date: out, time: prettyTime() });
        }

        kind = "date";
    }

    return [out, kind];
};

type PrettyDateProps = {
    date: Date;
    isLive?: boolean;
    prefixKind?: "start" | "end";
    noTooltip?: boolean;
    alwaysShowTime?: boolean;
};

/**
 * Formats a date as something relative like "3 days ago"
 * or "Started 3 days ago" in case of live events.
 */
export const PrettyDate: React.FC<PrettyDateProps> = ({
    date,
    isLive = false,
    prefixKind = "start",
    noTooltip = false,
    alwaysShowTime = false,
}) => {
    const { t, i18n } = useTranslation();
    const locale = preferredLocaleForLang(i18n.language);

    const [now, setNow] = useState(new Date());

    const [pretty, kind] = prettyDate(date, now, i18n, alwaysShowTime);


    // If we show a relative date, we rerender the component regularly.
    useEffect(() => {
        if (kind !== "rel-minutes") {
            return;
        }
        const interval = setInterval(() => setNow(new Date()), 5000);
        return () => clearInterval(interval);
    }, [kind, setNow]);

    // For live videos, we add a "Started" or "Starts".
    const out = (() => {
        if (!isLive) {
            return pretty;
        }

        // For some languages we lowercase the start, as otherwise we would end
        // up with "Started Yesterday at 8:00".
        let adjusted = pretty;
        if (kind === "rel-day" && ["en", "de"].includes(i18n.language)) {
            adjusted = pretty.charAt(0).toLowerCase() + pretty.slice(1);
        }

        const affix = match(prefixKind, {
            "start": () => date > now ? "video.starts-in" : "video.started-when",
            "end": () => "video.ended-at" as const,
        });
        return t(affix, { datetime: adjusted });
    })();

    const preciseDate = preciseDateTime(date, locale);

    const inner = <time dateTime={date.toISOString()}>{out}</time>;
    return noTooltip
        ? inner
        : <WithTooltip tooltip={preciseDate} placement="bottom" distance={2}>
            {inner}
        </WithTooltip>;
};

/**
 * Returns the date as an ISO-like string. Format is locale-independent, but the
 * weekday is language-specific.
 */
export const preciseDateTime = (date: Date, locale: string): string => {
    const pad2 = (n: number) => String(n).padStart(2, "0");
    const year = date.getFullYear();
    const month = pad2(date.getMonth() + 1);
    const day = pad2(date.getDate());
    const hour = pad2(date.getHours());
    const minute = pad2(date.getMinutes());
    const second = pad2(date.getSeconds());
    const weekday = date.toLocaleString(locale, { weekday: "short" });

    return `${year}-${month}-${day} ${hour}:${minute}:${second} (${weekday})`;
};

/**
 * Returns the browser-preferred locale (potentially with region) for the given
 * language.
 */
export const preferredLocaleForLang = (lang: string): string => {
    const locale = navigator.languages.find(l => l.startsWith(lang));
    if (locale) {
        return locale;
    }

    // If not defined by the browser, special case English to use British
    // instead of US. That's more likely to be a good choice, given the usual
    // regions where Tobira is used. It also means we use a stupid date format
    // less often.
    return lang === "en" ? "en-gb" : lang;
};

/** Returns whether the two datetimes refer to the same day (in local time) */
const isSameDay = (a: Date, b: Date) => a.getFullYear() === b.getFullYear()
    && a.getMonth() === b.getMonth()
    && a.getDate() === b.getDate();

/** Returns whether `date` is in the same week as `now` (with Mo being week start) */
const isInCurrentWeek = (date: Date, now: Date): boolean => {
    // We use Monday as first day of the week. We unfortunately have no way
    // to test what the user's system prefers, but Tobira is mainly used in
    // Europe and it's "error condition" is really mild: US users for
    // example could see "Mon at 12:00" on a Sunday, which they will
    // probably not confuse with "tomorrow".
    const startOfWeek = new Date(now);
    const weekday = now.getDay() === 0 ? 6 : now.getDay() - 1;
    startOfWeek.setDate(now.getDate() - weekday);
    startOfWeek.setHours(0);
    startOfWeek.setMinutes(0);
    startOfWeek.setSeconds(0);

    const startOfNextWeek = new Date(startOfWeek);
    startOfNextWeek.setDate(startOfWeek.getDate() + 7);

    return date >= startOfWeek && date < startOfNextWeek;
};

/** Returns `now` but advanced `days` days into the future. Negative `days` is allowed. */
const daysLater = (now: Date, days: number): Date => {
    const out = new Date(now);
    out.setDate(now.getDate() + days); // Yes, this handles underflow
    return out;
};
