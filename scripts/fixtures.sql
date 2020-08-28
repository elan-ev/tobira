create procedure department(name text)
language plpgsql
as $$
declare
    root realms.id%type;
    y_root realms.id%type;
begin
    insert into realms (name, parent)
    values (name, 0)
    returning id into root;

    for y in 2020 .. 2021 loop
        insert into realms (name, parent)
        values (y, root)
        returning id into y_root;

        insert into realms (name, parent)
        values ('Summer', y_root);
        insert into realms (name, parent)
        values ('Winter', y_root);
    end loop;
end; $$;

call department('Mathematics');
call department('Computer Science');
call department('Physics');

drop procedure department;
