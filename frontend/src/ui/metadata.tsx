import { ReactNode } from "react";
import { useTranslation } from "react-i18next";


export const TitleLabel: React.FC<{ htmlFor: string }> = ({ htmlFor }) => {
    const { t } = useTranslation();
    return (
        <label htmlFor={htmlFor}>
            {t("upload.metadata.title")}
            <span css={{ fontWeight: "normal" }}>
                {" ("}
                <em>{t("upload.metadata.required")}</em>
                {")"}
            </span>
        </label>
    );
};

/** Separates different inputs in the metadata form */
export const InputContainer: React.FC<{ children: ReactNode }> = ({ children }) => (
    <div css={{ margin: "16px 0 " }}>{children}</div>
);

type SmallDescriptionProps = {
    text: string | null;
    lines?: number;
};

/**
 * An event's or series' description in at most `lines` lines. The text is not
 * transformed at all, but emitted as is.
 */
export const SmallDescription: React.FC<SmallDescriptionProps> = ({ text, lines = 2 }) => {
    const { t } = useTranslation();
    const sharedStyle = {
        fontSize: 13,
        marginTop: 4,
    };

    if (text === null) {
        return <div css={{
            ...sharedStyle,
            color: "var(--grey65)",
            fontStyle: "italic",
        }}>{t("manage.my-videos.no-description")}</div>;
    } else {
        return <div css={{
            ...sharedStyle,
            color: "var(--grey40)",
            maxWidth: 800,
            display: "-webkit-box",
            WebkitBoxOrient: "vertical",
            textOverflow: "ellipsis",
            WebkitLineClamp: lines,
            overflow: "hidden",
        }}>{text}</div>;
    }
};


type DescriptionProps = {
    text: string | null;
    className?: string;
};

/**
 * Display an event's or series' description. The text is transformed slightly
 * into proper paragraphs.
 */
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
