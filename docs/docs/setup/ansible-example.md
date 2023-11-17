---
sidebar_position: 6
---

# Ansible example

This document shows some Ansible scripts that can serve as a starting point to deploy Tobira.

:::note
These are **not** ready-to-use scripts. You have to adjust them according to your needs!
In fact, this is even untested. It's just provided on a best effort basis.
:::

---

## Known problems and missing things

- These scripts don't setup automatic database backup. **But _you_ should!**
- These script can't deal properly with a Meili update that requires the index to be deleted/rebuilt.
- These scripts don't use `tobira check` which is a useful to command to run before restarting Tobira to make sure the restart will actually likely succeed.
- Webserver (e.g. nginx) setup is completely missing. This depends a lot on your authentication setup. A few notes:
  - Make sure to properly compress JS, SVG, HTML, and similar files. It improves loading speed by a lot!
  - You likely want to set some [security relevant headers](https://securityheaders.com/).
    Tobira already sets `Content-Security-Policy` by itself, but everything else you have to decide.


## Variables

Be sure to adjust the versions – we rarely update these docs.

```yaml title=vars.yml
db_password: "{{ vault_db_password }}"
meili_key: "{{ vault_meili_key }}"
tobira_trusted_external_key: "{{ vault_tobira_trusted_external_key }}"

tobira_release_url: "https://github.com/elan-ev/tobira/releases/download/v1.2/tobira-x86_64-unknown-linux-gnu"
tobira_release_checksum: "sha256:c173c60bc35e8fa922324910a4968557903c9382a5d46d67cc99a15df262e245"
meili_release_url: "https://github.com/meilisearch/meilisearch/releases/download/v1.4.2/meilisearch-linux-amd64"
meili_release_checksum: "sha256:b54b9ace213b0d45558c5d0e79710f718b63d2e29c190fb95be01dc27eb1ca5c"
```

## Services

### MeiliSearch

```yaml title=roles/tobira/tasks/setup_meili.yml
- name: create MeiliSearch directory
  file:
    path: /opt/meili
    state: directory
    mode: '0755'

- name: install MeiliSearch
  get_url:
    url: '{{ meili_release_url }}'
    dest: /opt/meili/meilisearch
    mode: '0755'
    checksum: '{{ meili_release_checksum }}'
  # TODO: this does not handle rebuilding the search index when doing a major meili update!
  # In that case, delete `/opt/meili/data.ms` and restart the tobira worker.
  notify: restart meili

- name: install MeiliSearch service file
  template:
    src: meili.service
    dest: /etc/systemd/system/meili.service
    mode: '0644'
    owner: root
    group: root
  notify: restart meili

- name: start and enable Meili
  service:
    name: meili
    state: started
    enabled: true
    daemon_reload: true
```

### Database

The following sets up a new PostgreSQL database.
But maybe your organization already offers a DB cluster with PostgreSQL.
In that case, you should use it.
Also not shown here: **setup regular database backups!**

```yaml title=roles/tobira/tasks/setup_db.yml
- name: install dependencies
  package:
    state: present
    name:
      - postgresql-server
      - postgresql-contrib
      # Python packages required for the 'postgresql_ext' module below.
      - python3
      - python3-psycopg2

# -----
# The next two are only necessary for PG < 14 which defaults to md5 otherwise.
# You might also need to adjust `/var/lib/pgsql/data/pg_hba.conf` to require
# scram-sha-256.
- name: initialize database
  command:
    cmd: postgresql-setup --initdb
    creates: /var/lib/pgsql/data/postgresql.conf

- name: set auth to scram-sha-256
  lineinfile:
    path: /var/lib/pgsql/data/postgresql.conf
    regexp: '^password_encryption'
    line: "password_encryption = 'scram-sha-256'"
  notify: restart postgresql
# ------ End section for PG < 14.

- name: start and enable database
  service:
    name: postgresql
    state: started
    enabled: yes

- name: create tobira postgres user
  become_user: postgres
  community.postgresql.postgresql_user:
    name: tobira
    password: "{{ db_password }}"

- name: create database
  become_user: postgres
  community.postgresql.postgresql_db:
    name: tobira
    owner: tobira

- name: add pgcrypto extension
  become_user: postgres
  community.postgresql.postgresql_ext:
    name: pgcrypto
    db: tobira
```

### Tobira

```yaml title=roles/tobira/tasks/setup_tobira.yml
- name: create tobira user
  user:
    name: tobira

- name: create application and logging directories
  file:
    path: "{{ item }}"
    state: directory
    owner: tobira
    group: tobira
    mode: '0755'
  loop:
    - /opt/tobira
    - /var/log/tobira

- name: Deploy Tobira executable
  get_url:
    url: '{{ tobira_binary_url }}'
    dest: /opt/tobira/tobira
    owner: tobira
    group: tobira
    mode: '0755'
    checksum: '{{ tobira_release_checksum }}'
  notify: restart tobira

- name: Deploy assets
  copy:
    src: "{{ item }}"
    dest: /opt/tobira/
    owner: tobira
    group: tobira
    mode: '0644'
  loop:
    - logo-large.svg
    - logo-small.svg
    - logo-large-dark.svg
    - logo-small-dark.svg
    - favicon.svg
  notify: restart tobira

- name: Deploy configuration
  template:
    src: config.toml
    dest: /opt/tobira/
    owner: tobira
    group: tobira
    mode: '0644'
  notify: restart tobira

- name: install tobira service files
  template:
    src: '{{ item }}.service'
    dest: /etc/systemd/system/{{ item }}.service
    mode: '0644'
    owner: root
    group: root
  loop:
    - tobira
    - tobira-worker
  notify: restart tobira

- name: start and enable tobira
  systemd:
    daemon_reload: true
    name: '{{ item }}'
    state: started
    enabled: true
  loop:
    - tobira
    - tobira-worker
```

## Other files

The scripts assume the following files to exist:

- `roles/tobira/`
  - `files/`
    - `logo-large.svg`
    - `logo-small.svg`
    - `favicon.svg`
  - `templates/`
    - `config.toml` (see [Configuration docs](./config))

### Service files

```systemd title=roles/tobira/templates/tobira.service
[Unit]
Description=Tobira
Documentation=https://github.com/elan-ev/tobira

After=local-fs.target
After=network.target
After=postgresql.service
After=meili.service

[Service]
WorkingDirectory=/opt/tobira/
ExecStart=/opt/tobira/tobira serve
Restart=always
User=tobira

[Install]
WantedBy=multi-user.target
```

```systemd title=roles/tobira/templates/tobira-worker.service
[Unit]
Description=Tobira Worker
Documentation=https://github.com/elan-ev/tobira

After=local-fs.target
After=network.target
After=postgresql.service
After=meili.service

[Service]
WorkingDirectory=/opt/tobira/
ExecStart=/opt/tobira/tobira worker
Restart=always
User=tobira

[Install]
WantedBy=multi-user.target
```

```systemd title=roles/tobira/templates/meili.service
[Unit]
Description=MeiliSearch
Documentation=https://docs.meilisearch.com/

After=local-fs.target
After=network.target

[Service]
WorkingDirectory=/opt/meili
# You decide, see https://docs.meilisearch.com/learn/what_is_meilisearch/telemetry.html
#Environment="MEILI_NO_ANALYTICS=true"
Environment="MEILI_MASTER_KEY={{ meili_key }}"
Environment="MEILI_HTTP_PAYLOAD_SIZE_LIMIT=20Gb"
ExecStart=/opt/meili/meilisearch
Restart=always

[Install]
WantedBy=multi-user.target
```
