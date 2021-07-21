create function main() returns void
language plpgsql
as $$
declare
    series_university_highlights series.id%type;
    series_christmas series.id%type;
    events_realm_id realms.id%type;
begin
    -- Add a few series
    insert into series (opencast_id, title, updated)
        values ('6d3f7e0c-c18f-4806-acc1-219a02cc7343', 'University Highlights', now())
        returning id into series_university_highlights;
    insert into series (opencast_id, title, description, updated)
        values ('f52ce5fd-fcde-4cd2-9c4b-7e8c7a9ff31d', 'Christmas Chemistry', 'Prof goes boom', now())
        returning id into series_christmas;

    -- Add lots of realms
    perform create_departments();
    events_realm_id := create_top_level_realm('Events', 'This university has very nice events. So very nice.');
    perform create_top_level_realm('Campus', 'Videos about life on the campus, the library, and more.');
    perform create_top_level_realm('Conferences', E'Videos from conferences our university hosts. Like: '
        '\n- Gamescom \n- ComicCon \n- BlizzCon \n- recon \n- RustFest.eu');

    insert into blocks (realm_id, type, index, text_content)
        values (
            0, 'text', 0,
            E'**Welcome to Tobira!**\n\n'
            'Tobira is a video portal for [Opencast](https://opencast.org). Note that it is still '
            'in its *early* stages of development! Everything you see here might still change. '
            'Tobira is fully open source and you can find its source '
            'code [here](https://github.com/elan-ev/tobira).\n\n'
            'What you are seeing here is the most recent development build (the latest `master`) '
            'containing a bunch of dummy data. All text and videos you can see here are just for '
            'testing.'
        );
    insert into blocks (realm_id, type, index, series_id, videolist_layout, videolist_order)
        values (0, 'series', 1, series_university_highlights, 'grid', 'new_to_old');

    insert into blocks (realm_id, type, index, series_id, videolist_layout, videolist_order)
        values (events_realm_id, 'series', 1, series_christmas, 'grid', 'new_to_old');


    -- Add a bunch of events/videos
    insert into events (opencast_id, title, tracks, thumbnail, duration, description, series, part_of, created, updated)
        values (
            'bbb',
            'Big Buck Bunny',
            array[row(
                'https://archive.org/download/BigBuckBunny_124/Content/big_buck_bunny_720p_surround.mp4',
                'presenter/preview',
                'video/mp4',
                '{640, 360}'
            )]::event_track[],
            'https://i.postimg.cc/nV2D2mTx/bbb.jpg',
            596000,
            'Big Buck Bunny (code-named Project Peach) is a 2008 short computer-animated comedy film featuring animals of the forest, made by the Blender Institute, part of the Blender Foundation.',
            series_university_highlights,
            '6d3f7e0c-c18f-4806-acc1-219a02cc7343',
            now(),
            now()
        );
    insert into events (opencast_id, title, tracks, thumbnail, duration, description, series, part_of, created, updated)
        values (
            'cosmos-laundromat',
            'Cosmos Laundromat',
            array[row(
                'https://upload.wikimedia.org/wikipedia/commons/3/36/Cosmos_Laundromat_-_First_Cycle_-_Official_Blender_Foundation_release.webm',
                'presenter/preview',
                'video/mp4',
                '{2048, 858}'
            )]::event_track[],
            'https://i.postimg.cc/HLQPr3mX/cosmos-laundromat.jpg',
            730000,
            'Cosmos Laundromat: First Cycle is an animated absurdist sci-fi fantasy short film directed by Mathieu Auvray, written by Esther Wouda, and produced by Ton Roosendaal. It is the Blender Institutes 5th "open movie" project, and was made utilizing the Blender software.',
            series_university_highlights,
            '6d3f7e0c-c18f-4806-acc1-219a02cc7343',
            now(),
            now()
        );
    insert into events (opencast_id, title, tracks, thumbnail, duration, description, series, part_of, created, updated)
        values (
            'spring',
            'Spring',
            array[row(
                'https://upload.wikimedia.org/wikipedia/commons/a/a5/Spring_-_Blender_Open_Movie.webm',
                'presenter/preview',
                'video/mp4',
                '{2048, 858}'
            )]::event_track[],
            'https://i.postimg.cc/Wzf5BHmL/spring.jpg',
            464000,
            'Spring is a 2019 animated fantasy short film directed and written by Andreas Goralczyk and produced by Ton Roosendaal and Francesco Siddi. It is the Blender Institutes 12th "open movie", and was made utilizing the open-source software, Blender.',
            series_university_highlights,
            '6d3f7e0c-c18f-4806-acc1-219a02cc7343',
            now(),
            now()
        );

    insert into events (opencast_id, title, tracks, thumbnail, duration, description, series, part_of, created, updated)
        values (
            'bee',
            'Guest Lecture: Group Intelligence of Bumblebees',
            array[row(
                'https://archive.org/download/BigBuckBunny_124/Content/big_buck_bunny_720p_surround.mp4',
                'presenter/preview',
                'video/mp4',
                '{640, 360}'
            )]::event_track[],
            'https://i.postimg.cc/y83GHsrf/bumblebee.jpg',
            552000,
            'Bumblebees are remarkable creatures. While a single one cannot achieve a lot on its own, in a group, they can even solve quantum gravity. Also, the video is actually Big Buck Bunny again.',
            series_christmas,
            'f52ce5fd-fcde-4cd2-9c4b-7e8c7a9ff31d',
            now(),
            now()
        );

    insert into events (opencast_id, title, tracks, thumbnail, duration, description, series, part_of, created, updated)
        values (
            'pir-introduction',
            'Programmieren in Rust: Einführung',
            array[row(
                'https://video4.virtuos.uos.de/static/mh_default_org/engage-player/2a7b1a55-5b47-4e13-bd11-45d5b6e3c2a2/20954d15-d0a5-4ce0-90ab-fc94620a4ccf/presentation_e048dadf_4cfc_4e30_be13_eb872574a7cb.mp4',
                'presenter/preview',
                'video/mp4',
                '{1280, 720}'
            )]::event_track[],
            'https://i.postimg.cc/tg0MRwK9/pir-einf-hrung.jpg',
            5159000,
            'Programmieren in Rust ist eine deutsche Vorlesung über die Programmiersprache Rust.',
            series_university_highlights,
            '6d3f7e0c-c18f-4806-acc1-219a02cc7343',
            now(),
            now()
        );
    insert into events (opencast_id, title, tracks, thumbnail, duration, description, series, part_of, created, updated)
        values (
            'pir-modules',
            'Programmieren in Rust: Module',
            array[row(
                'https://video4.virtuos.uos.de/static/mh_default_org/engage-player/bac86875-bbeb-42dc-9970-55af51c9f017/241ad38e-cc98-4326-a398-8c862d07ef9d/presentation_fc713d94_30ed_4056_a8a5_81ca90e8dcca.mp4',
                'presenter/preview',
                'video/mp4',
                '{1280, 720}'
            )]::event_track[],
            'https://i.postimg.cc/cCJD5SnB/pir-modules.jpg',
            4605000,
            'Programmieren in Rust ist eine deutsche Vorlesung über die Programmiersprache Rust.',
            series_university_highlights,
            '6d3f7e0c-c18f-4806-acc1-219a02cc7343',
            now(),
            now()
        );
    insert into events (opencast_id, title, tracks, thumbnail, duration, description, series, part_of, created, updated)
        values (
            'pir-stack-heap',
            'Programmieren in Rust: Stack & Heap',
            array[row(
                'https://video4.virtuos.uos.de/static/mh_default_org/engage-player/31d04ddc-80a3-4344-a2c4-b4a0316f2e3a/a389856e-cb85-445a-a696-4e520446b6fe/presentation_6969f780_37f0_49a8_9228_f30ef81cc4ee.mp4',
                'presenter/preview',
                'video/mp4',
                '{1280, 720}'
            )]::event_track[],
            'https://i.postimg.cc/k4s1c4B5/pir-heap-stack.jpg',
            4425000,
            'Programmieren in Rust ist eine deutsche Vorlesung über die Programmiersprache Rust.',
            series_university_highlights,
            '6d3f7e0c-c18f-4806-acc1-219a02cc7343',
            now(),
            now()
        );
    insert into events (opencast_id, title, tracks, thumbnail, duration, description, series, part_of, created, updated)
        values (
            'pir-performance',
            'Programmieren in Rust: Performance & Effizienz',
            array[row(
                'https://video4.virtuos.uos.de/static/mh_default_org/engage-player/84b2b573-e900-4692-bdab-7cea4fd8c332/376cb1f5-0535-4eef-bac4-ea3ee3fed6a8/presentation_c51b67c6_c5b1_498b_abbc_9171524008fd.mp4',
                'presenter/preview',
                'video/mp4',
                '{1280, 720}'
            )]::event_track[],
            'https://i.postimg.cc/Y9MDYg2V/pir-performance.jpg',
            5191000,
            'Programmieren in Rust ist eine deutsche Vorlesung über die Programmiersprache Rust.',
            series_university_highlights,
            '6d3f7e0c-c18f-4806-acc1-219a02cc7343',
            now(),
            now()
        );
end; $$;


-- Creates a dummy realm with parent = root
create function create_top_level_realm(name text, description text) returns bigint
language plpgsql
as $$
declare
    realm_id realms.id%type;
begin
    insert into realms (name, parent, path)
        values (name, 0, '/' || replace(lower(name), ' ', '-'))
        returning id into realm_id;

    insert into blocks (realm_id, type, index, text_content)
        values (realm_id, 'text', '0', description);

    return realm_id;
end; $$;


-- Creates a top-level realm "Lectures" and a bunch of dummy data as children.
create function create_departments() returns void
language plpgsql
as $$
declare
    root realms.id%type;
begin
    insert into realms (name, parent, path)
        values ('Lectures', 0, '/lectures')
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
    insert into realms (name, parent, path)
        values (name, lectures_root, '/lectures/' || replace(lower(name), ' ', '-'))
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
        insert into realms (name, parent, path)
            values (y, root, '/lectures/' || replace(lower(name), ' ', '-') || '/' || y::text)
            returning id into y_root;

        insert into realms (name, parent, path)
            values ('Summer', y_root, '/lectures/' || replace(lower(name), ' ', '-') || '/' || y::text || '/summer');
        insert into realms (name, parent, path)
            values ('Winter', y_root, '/lectures/' || replace(lower(name), ' ', '-') || '/' || y::text || '/winter');
    end loop;
end; $$;


-- Run it
select main();

-- Cleanup
drop function main;
drop function department;
drop function create_departments;
drop function create_top_level_realm;
