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
