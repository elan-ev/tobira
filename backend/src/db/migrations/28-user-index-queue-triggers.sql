-- Continuation from the previous migration script...

-- Add a trigger to automatically add a user to the queue whenever its changed.
create function queue_user_for_reindex(u users) returns void language sql as $$
    insert into search_index_queue (item_id, kind)
    values (u.id, 'user')
    on conflict do nothing
$$;

create function queue_touched_user_for_reindex()
   returns trigger
   language plpgsql
as $$
begin
    if tg_op <> 'INSERT' then
        perform queue_user_for_reindex(old);
    end if;
    if tg_op <> 'DELETE' then
        perform queue_user_for_reindex(new);
    end if;
    return null;
end;
$$;

-- We do not care about changed to `last_seen`. We don't currently use it and as
-- this is a frequently changing field, it would cause many index modifications
-- all the time.
create trigger queue_touched_user_for_reindex
after insert or delete or update of username, display_name, email, user_role
on users
for each row
execute procedure queue_touched_user_for_reindex();
