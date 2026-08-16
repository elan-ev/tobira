-- Inserts some known groups into the DB. Three large ones and then roughly 2k
-- ones taken from the realm tree, representing individual courses.

insert into known_groups (role, label, implies, warn_for_action, assignable_by)
values
    ('ROLE_STUDENTS', hstore(array['default', 'Students', 'de', 'Studierende']), '{}',
        array['write'], '{"read": ["ROLE_ANONYMOUS"], "write": ["ROLE_INSTRUCTOR"]}'),
    ('ROLE_STAFF', hstore(array['default', 'Staff', 'de', 'Angestellte']), '{}',
        array['write'], '{"read": ["ROLE_ANONYMOUS"]}'),
    ('ROLE_LECTURER', hstore(array['default', 'Lecturers', 'de', 'Vortragende']), array['ROLE_STAFF'],
        array['write'], '{"read": ["ROLE_ANONYMOUS"]}');

-- Only the course's own students/assistants/instructors can see and assign
-- its group (instructors can grant write, everyone in the course can grant
-- read), demonstrating how `assignable_by` scopes course groups to their
-- course instead of showing all ~2k of them to everyone.
insert into known_groups (role, label, implies, warn_for_action, assignable_by)
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
    '{}',
    jsonb_build_object(
        'read', array['ROLE_COURSE_' || path_segment || '_STUDENTS'],
        'write', array['ROLE_COURSE_' || path_segment || '_INSTRUCTORS']
    )
from realms,
    (values 
        ('STUDENTS', 'Studierende', 'Students'), 
        ('ASSISTANTS', 'Assistierende', 'Assistants'), 
        ('INSTRUCTORS', 'Lehrende', 'Instructors')
    ) as tmp (kind, label_de, label_en)
where full_path similar to '/lectures/[^/]+/2020/(autumn|spring)/%'
and name is not null
on conflict do nothing;
