create function main() returns void
language plpgsql
as $$
declare
    series_university_highlights series.id%type;
    series_christmas series.id%type;
begin
    -- Add a few series
    insert into series (opencast_id, title)
        values ('6d3f7e0c-c18f-4806-acc1-219a02cc7343', 'University Highlights')
        returning id into series_university_highlights;
    insert into series (opencast_id, title, description)
        values ('f52ce5fd-fcde-4cd2-9c4b-7e8c7a9ff31d', 'Christmas Chemistry', 'Prof goes boom')
        returning id into series_christmas;

    -- Add lots of realms
    perform create_departments();
    perform create_top_level_realm('Events');
    perform create_top_level_realm('Campus');
    perform create_top_level_realm('Conferences');

    insert into blocks (realm_id, type, index, text_content)
        values (
            0, 'text', 0,
            'Welcome to Tobira! This database contains dummy data intended for development. Have fun!'
        );
    insert into blocks (realm_id, type, index, videolist_series, videolist_layout, videolist_order)
        values (0, 'videolist', 1, series_university_highlights, 'horizontal', 'new_to_old');

    insert into events (opencast_id, title, video, description, series)
        values (
            'bbb',
            'Big Buck Bunny',
            'https://archive.org/download/BigBuckBunny_124/Content/big_buck_bunny_720p_surround.mp4',
            'Big Buck Bunny (code-named Project Peach) is a 2008 short computer-animated comedy film featuring animals of the forest, made by the Blender Institute, part of the Blender Foundation.',
            series_university_highlights
        );
end; $$;


-- Creates a dummy realm with parent = root
create function create_top_level_realm(name text) returns void
language plpgsql
as $$
declare
    root realms.id%type;
begin
    insert into realms (name, parent, path_segment)
        values (name, 0, replace(lower(name), ' ', '-'))
        returning id into root;

    insert into blocks (realm_id, type, index, title, text_content)
        values (root, 'text', '0', 'Description', 'Some other top level realm...');
end; $$;


-- Creates a top-level realm "Lectures" and a bunch of dummy data as children.
create function create_departments() returns void
language plpgsql
as $$
declare
    root realms.id%type;
begin
    insert into realms (name, parent, path_segment)
        values ('Lectures', 0, 'lectures')
        returning id into root;

    insert into blocks (realm_id, type, index, title, text_content)
        values (root, 'text', '0', 'Description', 'Here you can see all lecture recordings.');

    perform department(root, 'Mathematics');
    perform department(root, 'Computer Science');
    perform department(root, 'Physics');
    perform department(root, 'Psychology');
    perform department(root, 'Neuroscience');
    perform department(root, 'Philosophy');
    perform department(root, 'Biology');
    perform department(root, 'Economics');
end; $$;

create function department(lectures_root realms.id%type, name text) returns void
language plpgsql
as $$
declare
    root realms.id%type;
    y_root realms.id%type;
begin
    insert into realms (name, parent, path_segment)
        values (name, lectures_root, replace(lower(name), ' ', '-'))
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


-- Run it
select main();

-- Cleanup
drop function main;
drop function department;
drop function create_departments;
