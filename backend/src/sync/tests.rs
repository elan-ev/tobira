use secrecy::Secret;

use super::SyncConfig;


#[test]
fn config_validate() {
    let fill = || SyncConfig {
        host: "localhost".into(),
        use_insecure_connection: false,
        user: "tobira".into(),
        password: Secret::new("password".into()),
        preferred_harvest_size: 500,
    };

    let loopback_hosts = [
        "localhost",
        "localhost:1234",
        "127.0.0.1",
        "127.0.0.1:4321",
        "127.1.2.3",
        "127.1.2.3:4321",
        "::1",
        "[::1]:4321",
    ];

    for &host in &loopback_hosts {
        for &use_insecure_connection in &[true, false] {
            let config = SyncConfig { host: host.into(), use_insecure_connection, ..fill() };
            if let Err(e) = config.validate() {
                panic!("Failed to validate {:#?}: {}", config, e);
            }
        }
    }

    let non_loopback_hosts = [
        "1.1.1.1",
        "1.1.1.1:3456",
        "2606:4700:4700::1111",
        "[2606:4700:4700::1111]:3456",
        "github.com",
        "github.com:3456",
    ];

    for &host in &non_loopback_hosts {
        // Check that it validates fine when using HTTPS
        let config_secure = SyncConfig {
            host: host.into(),
            use_insecure_connection: false,
            ..fill()
        };
        if let Err(e) = config_secure.validate() {
            panic!("Failed to validate {:#?}: {}", config_secure, e);
        }

        // ... but that it fails to validate using HTTP
        let config_insecure = SyncConfig {
            host: host.into(),
            use_insecure_connection: true,
            ..fill()
        };
        if config_insecure.validate().is_ok() {
            panic!(
                "Sync config validated successfully, but shouldn't! \n{:#?}",
                config_insecure,
            );
        }
    }
}
