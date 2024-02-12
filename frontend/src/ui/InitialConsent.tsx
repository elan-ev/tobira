import { useEffect, useRef, useState } from "react";
import CONFIG from "../config";
import { currentRef, useTranslatedConfig } from "../util";
import { Modal, ModalHandle } from "./Modal";
import { Button } from "./Button";
import { TextBlock } from "./Blocks/Text";


const USER_CONSENT = "tobiraUserConsent";

export const InitialConsent: React.FC = () => {
    if (!CONFIG.initialConsent) {
        return null;
    }
    const [hash, setHash] = useState("");
    const userConsent = localStorage.getItem(USER_CONSENT);
    const modalRef = useRef<ModalHandle>(null);
    const title = useTranslatedConfig(CONFIG.initialConsent.title);
    const text = useTranslatedConfig(CONFIG.initialConsent.text);
    const buttonLabel = useTranslatedConfig(CONFIG.initialConsent.button);

    useEffect(() => {
        const makeHash = async () => {
            const msgUint8 = new TextEncoder().encode(JSON.stringify(CONFIG.initialConsent));
            const hashBuffer = await crypto.subtle.digest("SHA-256", msgUint8);
            const hashArray = Array.from(new Uint8Array(hashBuffer));
            const hashHex = hashArray
                .map(b => b.toString(16).padStart(2, "0"))
                .join("");
            setHash(hashHex);
        };
        makeHash();
    }, []);

    return hash === userConsent ? null : (
        <Modal
            open
            ref={modalRef}
            title={title}
            closable={false}
            initialFocus={false}
        >
            <TextBlock content={text} />
            <div css={{ display: "flex" }}>
                <Button css={{ marginTop: 20, marginLeft: "auto" }} onClick={() => {
                    localStorage.setItem(USER_CONSENT, hash);
                    currentRef(modalRef).close?.();
                }}>{buttonLabel}</Button>
            </div>
        </Modal>
    );
};

