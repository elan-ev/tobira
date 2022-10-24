alter type event_track
    -- Identifies the master playlist of an event with multiple HLS tracks.
    -- These can happen for example when you encode multiple qualities
    -- using `multiencode` in Opencast.
    add attribute is_master bool;
