create function department(name text) returns void
language plpgsql
as $$
declare
    root realms.id%type;
    y_root realms.id%type;
begin
    insert into realms (name, parent, path_segment)
    values (name, 0, replace(lower(name), ' ', '-'))
    returning id into root;

    insert into blocks (realm_id, type, index, title, text_content)
        values (root, 'text', '0', 'Description', format(
            'Hello to the department of %s! We are very proud of what we have achieved in '
                || 'this department and there is a lot of interesting stuff around here. '
                || 'Take a look at our swell videos. And do not forget to like, subscribe '
                || 'and hit that bell icon!',
            name
        ));

    for y in 2020 .. 2021 loop
        insert into realms (name, parent, path_segment)
        values (y, root, y::text)
        returning id into y_root;

        insert into realms (name, parent, path_segment)
        values ('Summer', y_root, 'summer');
        insert into realms (name, parent, path_segment)
        values ('Winter', y_root, 'winter');
    end loop;
end; $$;

select department('Mathematics');
select department('Computer Science');
select department('Physics');

drop function department;

insert into blocks (realm_id, type, index, text_content)
    values (
        0, 'text', 0,
        'Welcome to Tobira! This database contains dummy data intended for development. Have fun!'
    );
