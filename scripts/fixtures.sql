create procedure department(name text)
language plpgsql
as $$
declare
    root realms.id%type;
    y_root realms.id%type;
begin
    insert into realms (name, parent, path)
    values (name, 0, replace(lower(name), ' ', '-'))
    returning id into root;

    for y in 2020 .. 2021 loop
        insert into realms (name, parent, path)
        values (y, root, y::text)
        returning id into y_root;

        insert into realms (name, parent, path)
        values ('Summer', y_root, 'summer');
        insert into realms (name, parent, path)
        values ('Winter', y_root, 'winter');
    end loop;
end; $$;

call department('Mathematics');
call department('Computer Science');
call department('Physics');

drop procedure department;
