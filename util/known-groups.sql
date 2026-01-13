-- Inserts some known groups into the DB. Three large ones and then roughly 2k
-- ones taken from the realm tree, representing individual courses.

insert into known_groups (role, label, implies, large)
values
    ('ROLE_STUDENTS', hstore(array['default', 'Students', 'de', 'Studierende']), '{}', true),
    ('ROLE_STAFF', hstore(array['default', 'Staff', 'de', 'Angestellte']), '{}', true),
    ('ROLE_LECTURER', hstore(array['default', 'Lecturers', 'de', 'Vortragende']), array['ROLE_STAFF'], true);

insert into known_groups (role, label, implies, large)
select
    'ROLE_COURSE_' || path_segment || '_' || kind,
    hstore(array['default', 'de'], array[
        label_en || ' of „' || name || '“',
        label_de || ' von „' || name || '“'
    ]),
    case
        when kind = 'STUDENTS' then array[]::text[]
        when kind = 'ASSISTANTS' then array['ROLE_COURSE_' || path_segment || '_STUDENTS']
        when kind = 'INSTRUCTORS' then array['ROLE_COURSE_' || path_segment || '_ASSISTANTS']
    end,
    false
from realms,
    (values
        ('STUDENTS', 'Studierende', 'Students'),
        ('ASSISTANTS', 'Assistierende', 'Assistants'),
        ('INSTRUCTORS', 'Lehrende', 'Instructors')
    ) as tmp (kind, label_de, label_en)
where full_path similar to '/lectures/[^/]+/2020/(autumn|spring)/%'
and name is not null
on conflict do nothing;
