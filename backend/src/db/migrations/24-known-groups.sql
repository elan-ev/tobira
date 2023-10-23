create extension if not exists hstore;

create table known_groups (
    role text primary key,

    -- Label for this group in different languages. Map from language code to label.
    label hstore not null,

    -- List of other roles that having this 'role' implies. For example,
    -- 'ROLE_COURSE_123_LEARNER' could imply 'ROLE_STUDENT'. All roles imply
    -- 'ROLE_USER' and 'ROLE_ANONYMOUS' implicitly, so don't list those here.
    implies text[] not null,

    -- Whether this group is considered so large that giving write access to it
    -- is unusual enough to show a warning.
    large bool not null,


    constraint label_hstore_not_empty check (label <> ''::hstore),
    constraint label_contains_no_nulls check (array_position(avals(label), null) is null),
    constraint implies_has_no_role_user_or_anon check (
        not(implies && array['ROLE_USER', 'ROLE_ANONYMOUS'])
    )
);
