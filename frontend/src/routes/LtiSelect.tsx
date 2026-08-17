import { useEffect, useState } from "react";
import { useTranslation } from "react-i18next";
import { Button, Card } from "@opencast/appkit";

import { makeRoute } from "../rauta";
import { EventSelector } from "../ui/EventSelector";
import { VideoListSelector } from "../ui/SearchableSelect";
import { COLORS } from "../color";
import { focusStyle } from "../ui";


/** What kinds of content can be picked. */
type ContentKind = "video" | "series" | "playlist";

/** The teacher's current pick, ready to be confirmed. */
type Picked = {
    id: string;
    title: string;
};

/**
 * The LTI Deep Linking selection page. Opened by `/~lti/launch` for
 * `LtiDeepLinkingRequest` launches (with a one-time token in `s`).
 *
 * LMS platforms usually open the selection in an iframe, where Tobira's
 * session cookie does not exist. In that case this page acts as a *bridge*:
 * it opens itself in a popup (via the one-time cookie handoff endpoint),
 * waits for the popup to confirm a selection, and then navigates the iframe
 * to the return endpoint — which auto-POSTs the signed response to the LMS,
 * inside the frame, where the LMS expects it.
 */
export const LtiSelectRoute = makeRoute({
    url: ({ token }: { token: string }) => `/~lti/select?s=${encodeURIComponent(token)}`,
    match: url => {
        if (url.pathname !== "/~lti/select") {
            return null;
        }
        const token = url.searchParams.get("s") ?? "";
        return {
            render: () => <LtiSelect token={token} />,
        };
    },
});

/** Messages the selection popup sends to the bridge page (same origin). */
type PopupMessage = {
    tobiraLtiSelect: "done" | "cancel";
};

const returnUrl = (token: string, cancel: boolean): string =>
    `/~lti/deep-link-return?s=${encodeURIComponent(token)}${cancel ? "&cancel=1" : ""}`;

const LtiSelect: React.FC<{ token: string }> = ({ token }) => {
    const { t } = useTranslation();

    if (!token) {
        return <PageWrapper>
            <Card kind="error">{t("lti.select.no-token")}</Card>
        </PageWrapper>;
    }

    // Iframed (the usual case, e.g. Moodle's modal): bridge to a popup.
    // Top-level: select right here.
    return window === window.top
        ? <Selection token={token} />
        : <Bridge token={token} />;
};

/** Shown inside the LMS iframe: opens the popup and waits for its result. */
const Bridge: React.FC<{ token: string }> = ({ token }) => {
    const { t } = useTranslation();
    const [popupOpen, setPopupOpen] = useState(false);

    useEffect(() => {
        const onMessage = (event: MessageEvent) => {
            // Only the selection popup (same origin) may finish this flow.
            if (event.origin !== window.location.origin) {
                return;
            }
            const message = event.data as PopupMessage;
            if (message?.tobiraLtiSelect === "done") {
                window.location.assign(returnUrl(token, false));
            } else if (message?.tobiraLtiSelect === "cancel") {
                window.location.assign(returnUrl(token, true));
            }
        };
        window.addEventListener("message", onMessage);
        return () => window.removeEventListener("message", onMessage);
    }, [token]);

    const openPopup = () => {
        window.open(
            `/~lti/select-window?s=${encodeURIComponent(token)}`,
            "_blank",
            "popup,width=1100,height=800",
        );
        setPopupOpen(true);
    };

    return <PageWrapper>
        <p css={{ maxWidth: 600 }}>{t("lti.select.bridge-explainer")}</p>
        {popupOpen
            ? <p css={{ color: COLORS.neutral60 }}>{t("lti.select.window-open")}</p>
            : <Button kind="call-to-action" onClick={openPopup}>
                {t("lti.select.open-window")}
            </Button>}
    </PageWrapper>;
};

/** The actual selection UI (running top-level, with a session). */
const Selection: React.FC<{ token: string }> = ({ token }) => {
    const { t } = useTranslation();
    const [kind, setKind] = useState<ContentKind>("video");
    const [picked, setPicked] = useState<Picked | null>(null);
    const [state, setState] = useState<"selecting" | "submitting" | "failed">("selecting");

    // Whether we are the popup of a bridge page (iframed LMS) or the whole
    // flow runs in this window (LMS opened a real window).
    const finish = (outcome: "done" | "cancel") => {
        if (window.opener) {
            const message: PopupMessage = { tobiraLtiSelect: outcome };
            (window.opener as Window).postMessage(message, window.location.origin);
            window.close();
        } else {
            window.location.assign(returnUrl(token, outcome === "cancel"));
        }
    };

    const insert = async () => {
        if (!picked) {
            return;
        }
        setState("submitting");
        try {
            const body = new URLSearchParams({ s: token, id: picked.id });
            const response = await fetch("/~lti/deep-link-confirm", {
                method: "POST",
                body,
                credentials: "same-origin",
            });
            if (!response.ok) {
                throw new Error(`unexpected response ${response.status}`);
            }
            finish("done");
        } catch (e) {
            // eslint-disable-next-line no-console
            console.error("Confirming the LTI selection failed: ", e);
            setState("failed");
        }
    };

    const kinds: ContentKind[] = ["video", "series", "playlist"];
    const onChange = (option?: { id: string; title: string } | null) => {
        setPicked(option ? { id: option.id, title: option.title } : null);
    };

    return <PageWrapper>
        <div css={{ display: "flex", gap: 8 }}>
            {kinds.map(k => <button
                key={k}
                onClick={() => {
                    setKind(k);
                    setPicked(null);
                }}
                css={{
                    padding: "6px 16px",
                    border: `1px solid ${COLORS.neutral40}`,
                    borderRadius: 4,
                    cursor: "pointer",
                    backgroundColor: k === kind ? COLORS.neutral20 : COLORS.neutral05,
                    fontWeight: k === kind ? "bold" : "normal",
                    ...focusStyle({}),
                }}
            >{t(`lti.select.kind.${k}`)}</button>)}
        </div>

        <div css={{ maxWidth: 600 }}>
            {kind === "video" && <EventSelector onChange={onChange} />}
            {kind === "series" && <VideoListSelector type="series" onChange={onChange} />}
            {kind === "playlist" && <VideoListSelector type="playlist" onChange={onChange} />}
        </div>

        {picked && <Card kind="info" css={{ maxWidth: 600 }}>
            {t("lti.select.picked")} <strong>{picked.title}</strong>
        </Card>}
        {state === "failed" && <Card kind="error">{t("lti.select.failed")}</Card>}

        <div css={{ display: "flex", gap: 12 }}>
            <Button
                kind="call-to-action"
                disabled={!picked || state === "submitting"}
                onClick={insert}
            >{t("lti.select.insert")}</Button>
            <Button onClick={() => finish("cancel")}>{t("general.action.cancel")}</Button>
        </div>
    </PageWrapper>;
};

/** Bare page scaffolding: this route renders without header/nav/footer. */
const PageWrapper: React.FC<{ children: React.ReactNode }> = ({ children }) => {
    const { t } = useTranslation();
    return <div css={{
        margin: "0 auto",
        padding: 24,
        maxWidth: 800,
        display: "flex",
        flexDirection: "column",
        gap: 16,
    }}>
        <h1 css={{ fontSize: 20 }}>{t("lti.select.title")}</h1>
        {children}
    </div>;
};
