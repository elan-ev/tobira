import { useRef } from "react";
import CONFIG from "../config";
import { currentRef, getTranslatedString, translatedConfig } from "../util";
import { Modal, ModalHandle } from "./Modal";
import { TextBlock } from "./Blocks/Text";
import { useTranslation } from "react-i18next";
import { Button, notNullish } from "@opencast/appkit";

const LOCAL_STORAGE_KEY = "tobiraUserConsent";

type Props = {
    consentGiven: boolean | null;
};

export const InitialConsent: React.FC<Props> = ({ consentGiven: initialConsentGiven }) => {
    const { i18n } = useTranslation();
    const modalRef = useRef<ModalHandle>(null);

    if (initialConsentGiven !== false || !CONFIG.initialConsent) {
        return null;
    }

    const onConsent = async () => {
        // Figure out the language in which the main text is shown. This is what
        // we store as "user given consent in that language".
        const currentLanguage = i18n.resolvedLanguage ?? "en";
        const usedLang = currentLanguage in notNullish(CONFIG.initialConsent).text
            ? currentLanguage
            : "en";

        const hash = await calcHash(usedLang);
        localStorage.setItem(LOCAL_STORAGE_KEY, `${usedLang}:${hash}`);
        currentRef(modalRef).close?.();
    };

    return (
        <Modal
            open
            ref={modalRef}
            title={translatedConfig(CONFIG.initialConsent.title, i18n)}
            closable={false}
            initialFocus={false}
        >
            <TextBlock content={translatedConfig(CONFIG.initialConsent.text, i18n)} />
            <div css={{ display: "flex" }}>
                <Button css={{ marginTop: 20, marginLeft: "auto" }} onClick={onConsent}>
                    {translatedConfig(CONFIG.initialConsent.button, i18n)}
                </Button>
            </div>
        </Modal>
    );
};

const calcHash = async (language: string): Promise<string> => {
    const conditions = notNullish(CONFIG.initialConsent);

    const data = getTranslatedString(conditions.title, language)
        + "\0" + getTranslatedString(conditions.button, language)
        + "\0" + getTranslatedString(conditions.text, language);
    const msg = new TextEncoder().encode(data);
    const hashBuffer = await crypto.subtle.digest("SHA-256", msg);
    const hashArray = Array.from(new Uint8Array(hashBuffer));
    return hashArray.map(b => b.toString(16).padStart(2, "0")).join("");
};

export const checkInitialConsent = async () => {
    if (!CONFIG.initialConsent) {
        return null;
    }

    const stored = localStorage.getItem(LOCAL_STORAGE_KEY);
    if (!stored) {
        return false;
    }

    const split = stored.split(":");
    if (split.length !== 2) {
        // eslint-disable-next-line no-console
        console.warn("Consent in local storage in unknown format");
        return false;
    }

    const [storedLang, storedHash] = split;
    const hash = await calcHash(storedLang);
    return hash === storedHash;
};
