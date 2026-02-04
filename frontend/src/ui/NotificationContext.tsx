import { bug, Card } from "@opencast/appkit";
import { createContext, useState, useContext, PropsWithChildren, useEffect, useMemo } from "react";
import { useRouter } from "../router";
import { i18n } from "i18next";
import { useTranslation } from "react-i18next";

export type NotificationMessage = {
    kind: "info" | "error";
    message: (i18n: i18n) => string;
    // The path where the notification should be displayed. If specified, the
    // notification will be cleared when the user navigates away from this path.
    scope?: string;
}

type NotificationContext = {
    notification?: NotificationMessage;
    setNotification: (msg?: NotificationMessage) => void;
}

const NotificationContext = createContext<NotificationContext | null>(null);

export const NotificationProvider: React.FC<PropsWithChildren> = ({ children }) => {
    const [notification, setNotification] = useState<NotificationMessage>();
    const router = useRouter();
    const value = useMemo(() => ({
        notification,
        setNotification,
    }), [notification]);

    useEffect(() => router.listenAtNav(({ newUrl }) => {
        if (notification?.scope && newUrl.pathname !== notification.scope) {
            setNotification(undefined);
        }
    }), [router, notification]);

    return <NotificationContext.Provider value={value}>
        {children}
    </NotificationContext.Provider>;
};

export const useNotification = () => {
    const { i18n } = useTranslation();
    const context = useContext(NotificationContext) ?? bug("Not initialized!");
    const { notification, setNotification } = context;

    const Notification: React.FC = () => notification && (
        <Card css={{ width: "fit-content", margin: "12px 0" }} kind={notification.kind}>
            {notification.message(i18n)}
        </Card>
    );

    return { Notification, setNotification };
};
