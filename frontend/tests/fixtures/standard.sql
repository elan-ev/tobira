-- The fixture used by most tests: a useful data set for many purposes.
--
-- This can be adjusted for the purpose of writing new tests, as long as it does
-- not affect existing tests.


-- ----- Series ---------------------------------------------------------------
insert into series (state, opencast_id, title, description, updated, read_roles, write_roles)
values ('ready', '6d3f7e0c-c18f-4806-acc1-219a02cc7343', 'Fabulous Cats', 'Some amazing cats.',
    '2022-05-03 12:20:00+00', '{}', '{"ROLE_USER_SABINE"}');

insert into series (state, opencast_id, title, description, updated, read_roles, write_roles)
values ('ready', 'f52ce5fd-fcde-4cd2-9c4b-7e8c7a9ff31d', 'Loyal Dogs', null,
    '2023-11-28 08:59:02+00', '{}', '{}');

insert into series (state, opencast_id, title, description, updated, read_roles, write_roles)
values ('ready', 'b1cbf499-e168-41fb-8b4e-2cde4835239d', 'Foxes are the very best!!',
    'Cat software running on dog hardware. Well, something like that.\n\nThere are also lots of nice video games about foxes.',
    '2008-11-11 18:45:27+00', '{"ROLE_USER"}', '{"ROLE_USER_SABINE","ROLE_USER_JOSE"}');

insert into series (state, opencast_id, title, description, updated, read_roles, write_roles)
values ('ready', '4034db58-0233-4926-9a6c-a88c6430cf14', 'Empty series', 'Has no videos :(',
    '2018-09-01 14:00:00+00', '{}', '{"ROLE_STAFF"}');

insert into series (state, opencast_id, title, description, updated, read_roles, write_roles)
values ('ready', 'b56452ed-5ff4-47a1-aa41-5950637b08fb', 'Unlisted series', 'Single unlisted video',
    '2016-09-02 14:30:00+00', '{}', '{"ROLE_USER_MORGAN"}');

insert into series (state, opencast_id, title, description, updated, read_roles, write_roles)
values ('waiting', '2b814c02-c849-4553-b5f5-f4e9e69fd74f', null, null, '-infinity', null, null);


-- ----- Videos ---------------------------------------------------------------
-- We have only very few different video files, as we really don't need many for
-- testing. So most videos have a video file that's unrelated to their content.
-- The duration also often does not fit to the file. Tests involving the video
-- player should only use videos where it fits.

insert into events (state, opencast_id, title, description, creators, metadata, series, part_of, duration, is_live,
    created, updated, start_time, end_time, read_roles, write_roles, thumbnail, tracks, captions)
values ('ready', 'aaa12fa0-95f8-4722-84d7-4fac5e59a572', 'Video of a Tabby Cat',
    'A nice cat captured with a narrow depth of field.\n\nKindly uploaded by Gustavo Belemmi with a very permissive license.',
    '{"Gustavo Belemmi"}',
    '{"dcterms": { "source": ["https://www.pexels.com/video/video-of-a-tabby-cat-854982/"] }}',
    (select id from series where title = 'Fabulous Cats'), '6d3f7e0c-c18f-4806-acc1-219a02cc7343',
    11520, false,
    '2022-03-01 12:00:00+00', '2022-03-01 13:01:00+00', null, null,
    '{"ROLE_ANONYMOUS"}', '{ROLE_USER_JOSE}',
    'http://localhost:38456/thumbnail-cat.jpg',
    array[
        row('http://localhost:38456/cat-bokeh-no-audio-x264-144p.mp4',
            'presenter/preview', 'video/mp4', '{256, 144}', true),
        row('http://localhost:38456/cat-bokeh-no-audio-x264-240p.mp4',
            'presenter/preview', 'video/mp4', '{432, 240}', true)
    ]::event_track[],
    '{}'
);

insert into events (state, opencast_id, title, description, creators, metadata, series, part_of, duration, is_live,
    created, updated, start_time, end_time, read_roles, write_roles, thumbnail, tracks, captions)
values ('ready', '2784521d-d10a-4a27-a77c-cd3f557259c2', 'Black Cat (protected)',
    'Secret kitty hihi',
    '{"klimkin"}',
    '{}',
    (select id from series where title = 'Fabulous Cats'), '6d3f7e0c-c18f-4806-acc1-219a02cc7343',
    11520, false,
    '2022-03-03 12:00:00+00', '2022-03-03 13:01:00+00', null, null,
    '{"ROLE_USER"}', '{ROLE_USER_MORGAN}',
    'http://localhost:38456/thumbnail-cat2.jpg',
    array[
        row('http://localhost:38456/cat-black-x264-144p.mp4',
            'presentation/preview', 'video/mp4', '{256, 144}', true),
        row('http://localhost:38456/cat-black-x264-240p.mp4',
            'presentation/preview', 'video/mp4', '{432, 240}', true)
    ]::event_track[],
    '{}'
);

-- Dual stream public
insert into events (state, opencast_id, title, description, creators, metadata, series, part_of, duration, is_live,
    created, updated, start_time, end_time, read_roles, write_roles, thumbnail, tracks, captions)
values ('ready', '172d4ec3-4e58-48b4-bdf0-85909a32439d', 'Dual Stream Cats',
    null,
    '{"Gustavo Belemmi", "klimkin"}',
    '{}',
    (select id from series where title = 'Fabulous Cats'), '6d3f7e0c-c18f-4806-acc1-219a02cc7343',
    11520, false,
    '2022-03-02 12:00:00+00', '2022-03-02 13:01:00+00', null, null,
    '{"ROLE_ANONYMOUS"}', '{ROLE_USER_JOSE, ROLE_USER_MORGAN}',
    'http://localhost:38456/thumbnail-cat.jpg',
    array[
        row('http://localhost:38456/cat-bokeh-no-audio-x264-144p.mp4',
            'presenter/preview', 'video/mp4', '{256, 144}', true),
        row('http://localhost:38456/cat-bokeh-no-audio-x264-240p.mp4',
            'presenter/preview', 'video/mp4', '{432, 240}', true),
        row('http://localhost:38456/cat-black-x264-144p.mp4',
            'presentation/preview', 'video/mp4', '{256, 144}', false),
        row('http://localhost:38456/cat-black-x264-240p.mp4',
            'presentation/preview', 'video/mp4', '{432, 240}', false)
    ]::event_track[],
    '{}'
);

-- Planned event
insert into events (state, opencast_id, title, description, creators, metadata, series, part_of, duration, is_live,
    created, updated, start_time, end_time, read_roles, write_roles, thumbnail, tracks, captions)
values ('ready', '9dc41ccb-4a54-498f-98cf-98ca455f708c', 'Far in the Future',
    null,
    '{"Peter Lustig"}',
    '{}',
    (select id from series where title = 'Loyal Dogs'), 'f52ce5fd-fcde-4cd2-9c4b-7e8c7a9ff31d',
    2700000, true,
    '2023-12-12 12:00:00+00', '2024-01-03 13:01:00+00', '2038-01-03 16:00:00+00', '2038-01-03 16:45:00+00',
    '{"ROLE_ANONYMOUS", "ROLE_USER"}', '{ROLE_STUDENTS}',
    'http://localhost:38456/thumbnail-cat2.jpg',
    array[
        row('http://localhost:38456/cat-black-x264-144p.mp4',
            'presentation/preview', 'video/mp4', '{256, 144}', true),
        row('http://localhost:38456/cat-black-x264-240p.mp4',
            'presentation/preview', 'video/mp4', '{432, 240}', true)
    ]::event_track[],
    '{}'
);

-- Live event
insert into events (state, opencast_id, title, description, creators, metadata, series, part_of, duration, is_live,
    created, updated, start_time, end_time, read_roles, write_roles, thumbnail, tracks, captions)
values ('ready', 'b5d4533f-0ddd-4dd2-aa64-de24d3b20d72', 'Currently live!!',
    null,
    '{"Die Maus"}',
    '{}',
    (select id from series where title = 'Loyal Dogs'), 'f52ce5fd-fcde-4cd2-9c4b-7e8c7a9ff31d',
    2700000, true,
    '2008-12-12 12:00:00+00', '2009-01-03 13:01:00+00', '2012-01-03 16:00:00+00', '2038-01-03 16:45:00+00',
    '{"ROLE_ANONYMOUS"}', '{}',
    'http://localhost:38456/thumbnail-cat.jpg',
    array[
        row('http://localhost:38456/cat-black-x264-144p.mp4',
            'presentation/preview', 'video/mp4', '{256, 144}', true)
    ]::event_track[],
    '{}'
);

-- Past Live event
insert into events (state, opencast_id, title, description, creators, metadata, series, part_of, duration, is_live,
    created, updated, start_time, end_time, read_roles, write_roles, thumbnail, tracks, captions)
values ('ready', 'd5af7441-e9a3-4a1f-a58d-1116b899c693', 'Past live event',
    null,
    '{"Hubert"}',
    '{}',
    (select id from series where title = 'Loyal Dogs'), 'f52ce5fd-fcde-4cd2-9c4b-7e8c7a9ff31d',
    2700000, true,
    '2008-12-12 12:00:00+00', '2009-01-03 13:01:00+00', '2012-01-03 16:00:00+00', '2012-01-03 16:45:00+00',
    '{"ROLE_ANONYMOUS"}', '{}',
    'http://localhost:38456/thumbnail-cat2.jpg',
    array[
        row('http://localhost:38456/cat-black-x264-144p.mp4',
            'presentation/preview', 'video/mp4', '{256, 144}', true)
    ]::event_track[],
    '{}'
);

-- Private video
insert into events (state, opencast_id, title, description, creators, metadata, series, part_of, duration, is_live,
    created, updated, start_time, end_time, read_roles, write_roles, thumbnail, tracks, captions)
values ('ready', '7205a608-08bc-44fc-af8d-65578697c625', 'Very secret private video',
    null,
    '{"Anon"}',
    '{}',
    (select id from series where title = 'Loyal Dogs'), 'f52ce5fd-fcde-4cd2-9c4b-7e8c7a9ff31d',
    50000, false,
    '2020-07-13 12:00:00+00', '2020-07-13 12:00:00+00', null, null,
    '{"ROLE_USER_MORGAN"}', '{"ROLE_USER_MORGAN"}',
    'http://localhost:38456/thumbnail-cat2.jpg',
    array[
        row('http://localhost:38456/scifi-tunnel-no-audio-x264-144p.mp4',
            'presentation/preview', 'video/mp4', '{256, 144}', true)
    ]::event_track[],
    '{}'
);

-- Portrait video
insert into events (state, opencast_id, title, description, creators, metadata, series, part_of, duration, is_live,
    created, updated, start_time, end_time, read_roles, write_roles, thumbnail, tracks, captions)
values ('ready', '2e5b56da-695d-4be8-b557-7f0fba51ca24', 'Portait video of a train',
    null,
    '{"Joachim Rübe"}',
    '{}',
    (select id from series where title = 'Foxes are the very best!!'), 'b1cbf499-e168-41fb-8b4e-2cde4835239d',
    8000, false,
    '2021-07-13 12:00:00+00', '2021-07-13 12:00:00+00', null, null,
    '{ROLE_USER}', '{ROLE_USER}',
    'http://localhost:38456/thumbnail-train.jpg',
    array[
        row('http://localhost:38456/train-portrait-x264.mp4',
            'presentation/preview', 'video/mp4', '{256, 144}', true)
    ]::event_track[],
    '{}'
);

-- 1h+ video
insert into events (state, opencast_id, title, description, creators, metadata, series, part_of, duration, is_live,
    created, updated, start_time, end_time, read_roles, write_roles, thumbnail, tracks, captions)
values ('ready', '1c5d5e89-76b7-4d81-a316-ef62b470e13d', 'Long boy',
    null,
    '{"Joachim Rübe"}',
    '{}',
    (select id from series where title = 'Foxes are the very best!!'), 'b1cbf499-e168-41fb-8b4e-2cde4835239d',
    5537000, false,
    '2021-07-13 12:00:00+00', '2021-07-13 12:00:00+00', null, null,
    '{ROLE_ANONYMOUS}', '{ROLE_STAFF}',
    'http://localhost:38456/thumbnail-train.jpg',
    array[
        row('http://localhost:38456/train-portrait-x264.mp4',
            'presentation/preview', 'video/mp4', '{256, 144}', true)
    ]::event_track[],
    '{}'
);

insert into events (state, opencast_id, title, description, creators, metadata, duration, is_live,
    created, updated, start_time, end_time, read_roles, write_roles, thumbnail, tracks, captions)
values ('ready', '0637a85a-c360-450b-900d-81f423cb21f3', 'Unlisted video without series',
    'Unlisted video being alone',
    '{"Stanley"}',
    '{}',
    12520, false,
    '2022-03-04 12:00:00+00', '2022-03-04 13:01:00+00', null, null,
    '{"ROLE_USER"}', '{ROLE_USER_JOSE}',
    'http://localhost:38456/thumbnail-cat2.jpg',
    array[
        row('http://localhost:38456/cat-black-x264-144p.mp4',
            'presentation/preview', 'video/mp4', '{256, 144}', true),
        row('http://localhost:38456/cat-black-x264-240p.mp4',
            'presentation/preview', 'video/mp4', '{432, 240}', true)
    ]::event_track[],
    '{}'
);

insert into events (state, opencast_id, title, description, creators, metadata, series, part_of, duration, is_live,
    created, updated, start_time, end_time, read_roles, write_roles, thumbnail, tracks, captions)
values ('ready', '06a71e43-94cd-472d-a345-952979489e88', 'Unlisted video in series',
    'Cheesecake is yummy',
    '{"klimkin"}',
    '{}',
    (select id from series where title = 'Unlisted series'), 'b56452ed-5ff4-47a1-aa41-5950637b08fb',
    13520, false,
    '2022-03-05 12:00:00+00', '2022-03-05 13:01:00+00', null, null,
    '{"ROLE_USER"}', '{ROLE_USER_MORGAN}',
    'http://localhost:38456/thumbnail-cat2.jpg',
    array[
        row('http://localhost:38456/cat-black-x264-144p.mp4',
            'presentation/preview', 'video/mp4', '{256, 144}', true),
        row('http://localhost:38456/cat-black-x264-240p.mp4',
            'presentation/preview', 'video/mp4', '{432, 240}', true)
    ]::event_track[],
    '{}'
);

-- TODO:
-- Video with subtitles -> array[row('https://...', 'en')]::event_caption[]


-- ----- Realms ---------------------------------------------------------------
insert into realms (parent, path_segment, name, child_order)
values (0, 'animals', 'Animal videos', 'by_index');
insert into realms (parent, path_segment, name, child_order)
values (0, 'support', 'Support page', 'alphabetic:asc');
insert into realms (parent, path_segment, name, child_order)
values (0, 'love', 'WILL DERIVE', 'alphabetic:desc');

insert into realms (parent, path_segment, name, index, child_order)
values ((select id from realms where full_path = '/animals'), 'cats', 'Cats', 2, 'alphabetic:asc');
insert into realms (parent, path_segment, name, index, child_order)
values ((select id from realms where full_path = '/animals'), 'dogs', 'Dogs', 0, 'alphabetic:asc');
insert into realms (parent, path_segment, name, index, child_order)
values ((select id from realms where full_path = '/animals'), 'foxes', 'Foxes', 1, 'alphabetic:asc');

insert into realms (parent, path_segment, name, child_order)
values ((select id from realms where full_path = '/animals/dogs'), 'small', 'Small ones', 'alphabetic:asc');
insert into realms (parent, path_segment, name, child_order)
values ((select id from realms where full_path = '/animals/dogs'), 'big', 'Big ones', 'alphabetic:asc');

insert into realms (parent, path_segment, name, child_order)
values ((select id from realms where full_path = '/love'), 'kiwi', 'Kiwis', 'alphabetic:asc');
insert into realms (parent, path_segment, name, child_order)
values ((select id from realms where full_path = '/love'), 'turtles', 'Turtles', 'alphabetic:desc');

-- Permissions
update realms set moderator_roles = '{ROLE_STAFF}' where full_path = '';
update realms set admin_roles = '{ROLE_USER_SABINE}' where full_path = '/love';
update realms set moderator_roles = '{ROLE_STUDENT}' where full_path = '/love';
update realms set admin_roles = '{ROLE_USER_MORGAN}' where full_path = '/love/kiwi';
update realms set moderator_roles = '{ROLE_USER_MORGAN}' where full_path = '/support';
update realms set admin_roles = '{ROLE_STAFF}' where full_path = '/animals';
update realms set admin_roles = '{ROLE_USER_BJOERK}' where full_path = '/animals/dogs';
update realms set moderator_roles = '{ROLE_USER_JOSE}' where full_path = '/animals/dogs';


-- ----- Blocks ---------------------------------------------------------------
-- Homepage
insert into blocks (realm, type, index, text_content)
    values (0, 'text', 0, 'Henlo good fren :3');
insert into blocks (realm, type, index, series, videolist_order, videolist_layout, show_title, show_metadata)
    values (0, 'series', 1,
        (select id from series where title = 'Fabulous Cats'),
        'a_to_z', 'gallery', true, true);
insert into blocks (realm, type, index, series, videolist_order, videolist_layout, show_title, show_metadata)
    values (0, 'series', 2,
        (select id from series where title = 'Loyal Dogs'),
        'old_to_new', 'slider', true, true);
insert into blocks (realm, type, index, text_content)
    values (0, 'text', 3, 'But there are _more_ than series. Check **this** out:');
insert into blocks (realm, type, index, video)
    values (0, 'video', 4, (select id from events where title = 'Video of a Tabby Cat'));
insert into blocks (realm, type, index, text_content)
    values (0, 'title', 5, 'Credits');
insert into blocks (realm, type, index, text_content)
    values (0, 'text', 6, 'I did it all by myself, hehe.');

-- /love page
insert into blocks (realm, type, index, text_content)
values ((select id from realms where full_path = '/love'),
    'text', 0, 'Welcome to this great page! :)');

insert into blocks (realm, type, index, series, videolist_order, videolist_layout, show_title, show_metadata)
values ((select id from realms where full_path = '/love'),
    'series', 1,
    (select id from series where title = 'Fabulous Cats'),
    'new_to_old', 'gallery', true, false);

update realms
set name = null, name_from_block = (
    select id from blocks where type = 'series'
        and realm = (select id from realms where full_path = '/love')
)
where full_path = '/love';

-- /support page (markdown test)
insert into blocks (realm, type, index, text_content)
values ((select id from realms where full_path = '/support'), 'text', 0,
    'This page contains various additional test videos. And this text block
also contains tests for various Markdown features.

> A block quote

An ordered list:
1. foo
2. bar
3. baz

You can also have `inline monofont` or even text blocks (without syntax highlighting):

```
fn main() {
    println!("Ja guten Morgen, Welt");
}
```

That is almost all. Here is a horizontal line:

---

And of course there is **bold** and *cursive* text.
');

-- animal pages
insert into blocks (realm, type, index, text_content)
values ((select id from realms where full_path = '/animals'),
    'text', 0, 'We have several different animals. Look at the nav!');
insert into blocks (realm, type, index, video)
    values ((select id from realms where full_path = '/animals'),
        'video', 1, (select id from events where title = 'Far in the Future'));
insert into blocks (realm, type, index, video, show_link)
    values ((select id from realms where full_path = '/animals'),
        'video', 2, (select id from events where title = 'Long boy'), false);

insert into blocks (realm, type, index, series, videolist_order, videolist_layout, show_title, show_metadata)
values ((select id from realms where full_path = '/animals/dogs'),
    'series', 0,
    (select id from series where title = 'Loyal Dogs'),
    'a_to_z', 'list', false, true);

insert into blocks (realm, type, index, series, videolist_order, videolist_layout, show_title, show_metadata)
values ((select id from realms where full_path = '/animals/cats'),
    'series', 0,
    (select id from series where title = 'Fabulous Cats'),
    'z_to_a', 'list', false, true);

insert into blocks (realm, type, index, series, videolist_order, videolist_layout, show_title, show_metadata)
values ((select id from realms where full_path = '/animals/foxes'),
    'series', 0,
    (select id from series where title = 'Foxes are the very best!!'),
    'z_to_a', 'gallery', false, false);

insert into blocks (realm, type, index, text_content)
values ((select id from realms where full_path = '/animals/dogs/big'),
    'text', 0, 'Big dogs are the better dogs.');
