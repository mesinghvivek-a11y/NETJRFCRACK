-- Syllabus manager: id prefix per subject, admin functions, usage view, and the Geography syllabus.
-- Run once, after 0005. Safe to run again.

alter table subjects add column if not exists id_prefix text;
create unique index if not exists subjects_id_prefix_uq on subjects (id_prefix);

-- ---------- Admin functions ----------
create or replace function admin_save_subject(p jsonb) returns jsonb
language plpgsql security definer set search_path = public as $$
declare sid text := lower(trim(p->>'id')); pref text := lower(trim(p->>'id_prefix')); old text; has_units boolean; is_existing boolean;
begin
  if not is_admin() then raise exception 'admin only'; end if;
  if sid !~ '^[a-z0-9_]{2,30}$' then raise exception 'Subject id must be 2 to 30 letters, numbers or underscores.'; end if;
  if pref !~ '^[a-z0-9]{2,6}$' then raise exception 'Id prefix must be 2 to 6 letters or numbers.'; end if;
  if coalesce(trim(p->>'name'), '') = '' then raise exception 'Name is required.'; end if;
  select id_prefix into old from subjects where id = sid;
  is_existing := found;
  select exists (select 1 from units where subject_id = sid) into has_units;
  if is_existing and old is not null and old <> pref and has_units then
    raise exception 'The id prefix cannot change after the syllabus has been added.';
  end if;
  insert into subjects (id, name, nta_code, id_prefix, questions_per_paper, minutes_per_paper)
  values (sid, trim(p->>'name'), nullif(trim(p->>'nta_code'), ''), pref,
          coalesce((p->>'questions_per_paper')::int, 100), coalesce((p->>'minutes_per_paper')::int, 120))
  on conflict (id) do update set name = excluded.name, nta_code = excluded.nta_code, id_prefix = excluded.id_prefix,
    questions_per_paper = excluded.questions_per_paper, minutes_per_paper = excluded.minutes_per_paper;
  return jsonb_build_object('id', sid);
end $$;

-- Saves a whole syllabus tree for one subject in one step. Existing ids are kept; new items get new ids.
create or replace function admin_apply_syllabus(p_subject text, p_units jsonb, p_remove_missing boolean default false)
returns jsonb
language plpgsql security definer set search_path = public as $$
declare
  pref text; u jsonb; t jsonb; uid text; tid text; unum int; n int; j int;
  add_u int := 0; add_t int := 0; rem_u int := 0; rem_t int := 0; blocked text;
  keep_u text[] := '{}'; keep_t text[] := '{}';
begin
  if not is_admin() then raise exception 'admin only'; end if;
  select id_prefix into pref from subjects where id = p_subject;
  if not found then raise exception 'Subject % not found.', p_subject; end if;
  if pref is null then raise exception 'Subject % has no id prefix.', p_subject; end if;

  for u in select e from jsonb_array_elements(p_units) as e loop
    if coalesce(trim(u->>'name'), '') = '' then raise exception 'Every unit needs a name.'; end if;
    uid := nullif(u->>'id', '');
    if uid is not null and not exists (select 1 from units where id = uid and subject_id = p_subject) then
      raise exception 'Unit % does not belong to %.', uid, p_subject;
    end if;
    if uid is null then
      unum := coalesce((u->>'number')::int, 0);
      if unum < 1 or exists (select 1 from units where subject_id = p_subject and number = unum) then
        select coalesce(max(number), 0) + 1 into unum from units where subject_id = p_subject;
      end if;
      uid := pref || '-u' || lpad(unum::text, 2, '0');
      insert into units (id, subject_id, number, name) values (uid, p_subject, unum, trim(u->>'name'));
      add_u := add_u + 1;
    else
      update units set name = trim(u->>'name') where id = uid;
    end if;
    keep_u := keep_u || uid;

    j := 0;
    for t in select e from jsonb_array_elements(coalesce(u->'topics', '[]'::jsonb)) as e loop
      if coalesce(trim(t->>'name'), '') = '' then raise exception 'Every topic needs a name.'; end if;
      j := j + 1;
      tid := nullif(t->>'id', '');
      if tid is not null and not exists (select 1 from topics where id = tid and unit_id = uid) then
        raise exception 'Topic % does not belong to unit %.', tid, uid;
      end if;
      if tid is null then
        select coalesce(max((regexp_replace(id, '^.*-t', ''))::int), 0) + 1 into n from topics where unit_id = uid;
        tid := uid || '-t' || lpad(n::text, 2, '0');
        insert into topics (id, unit_id, name, sort, is_legacy)
        values (tid, uid, trim(t->>'name'), j, coalesce((t->>'is_legacy')::boolean, false));
        add_t := add_t + 1;
      else
        update topics set name = trim(t->>'name'), sort = j, is_legacy = coalesce((t->>'is_legacy')::boolean, false)
         where id = tid;
      end if;
      keep_t := keep_t || tid;
    end loop;
  end loop;

  if p_remove_missing then
    select string_agg(x.id, ', ') into blocked from topics x join units un on un.id = x.unit_id
     where un.subject_id = p_subject and not (x.id = any (keep_t))
       and (exists (select 1 from questions q where q.primary_topic_id = x.id)
            or exists (select 1 from question_tags g where g.topic_id = x.id));
    if blocked is not null then raise exception 'These topics are used by questions, so they cannot be removed (retire them instead): %', blocked; end if;
    select string_agg(un.id, ', ') into blocked from units un
     where un.subject_id = p_subject and not (un.id = any (keep_u))
       and (exists (select 1 from questions q where q.primary_unit_id = un.id)
            or exists (select 1 from question_tags g where g.unit_id = un.id));
    if blocked is not null then raise exception 'These units are used by questions, so they cannot be removed: %', blocked; end if;

    with d as (delete from topics x using units un where un.id = x.unit_id and un.subject_id = p_subject
                and not (x.id = any (keep_t)) returning 1) select count(*) into rem_t from d;
    with d as (delete from units un where un.subject_id = p_subject and not (un.id = any (keep_u)) returning 1)
      select count(*) into rem_u from d;
  end if;

  return jsonb_build_object('units_added', add_u, 'topics_added', add_t, 'units_removed', rem_u, 'topics_removed', rem_t);
end $$;

create or replace function admin_delete_subject(p_subject text) returns void
language plpgsql security definer set search_path = public as $$
begin
  if not is_admin() then raise exception 'admin only'; end if;
  if exists (select 1 from papers where subject_id = p_subject) then
    raise exception 'This subject has papers. Remove them first.';
  end if;
  delete from subjects where id = p_subject;
end $$;

grant execute on function admin_save_subject(jsonb), admin_apply_syllabus(text, jsonb, boolean), admin_delete_subject(text) to authenticated;
revoke execute on function admin_save_subject(jsonb), admin_apply_syllabus(text, jsonb, boolean), admin_delete_subject(text) from public, anon;

-- How many questions use each unit/topic (admin screens).
create or replace view admin_syllabus_usage with (security_invoker = true) as
select unit_id, topic_id, count(distinct question_id)::int as n from question_tags group by unit_id, topic_id;
revoke all on admin_syllabus_usage from anon;

-- ---------- Geography syllabus (10 units, 160 topics) ----------
insert into subjects (id, name, nta_code, id_prefix, questions_per_paper, minutes_per_paper)
values ('geography', 'Geography', '80', 'geo', 100, 120)
on conflict (id) do update set name = excluded.name, nta_code = excluded.nta_code,
  id_prefix = coalesce(subjects.id_prefix, excluded.id_prefix);

insert into units (id, subject_id, number, name) values
  ('geo-u01', 'geography', 1, 'Geomorphology'),
  ('geo-u02', 'geography', 2, 'Climatology'),
  ('geo-u03', 'geography', 3, 'Oceanography'),
  ('geo-u04', 'geography', 4, 'Geography of Environment'),
  ('geo-u05', 'geography', 5, 'Population and Settlement Geography'),
  ('geo-u06', 'geography', 6, 'Geography of Economic Activities and Regional Development'),
  ('geo-u07', 'geography', 7, 'Cultural, Social and Political Geography'),
  ('geo-u08', 'geography', 8, 'Geographic Thought'),
  ('geo-u09', 'geography', 9, 'Geographical Techniques'),
  ('geo-u10', 'geography', 10, 'Geography of India')
on conflict (id) do update set name = excluded.name;

insert into topics (id, unit_id, name, sort) values
  ('geo-u01-t01', 'geo-u01', 'Continental Drift', 1),
  ('geo-u01-t02', 'geo-u01', 'Plate Tectonics', 2),
  ('geo-u01-t03', 'geo-u01', 'Endogenetic and Exogenetic Forces', 3),
  ('geo-u01-t04', 'geo-u01', 'Denudation and Weathering', 4),
  ('geo-u01-t05', 'geo-u01', 'Geomorphic Cycle (Davis and Penck)', 5),
  ('geo-u01-t06', 'geo-u01', 'Slope Development: Theories and Processes', 6),
  ('geo-u01-t07', 'geo-u01', 'Earth Movements: Seismicity', 7),
  ('geo-u01-t08', 'geo-u01', 'Earth Movements: Folding and Faulting', 8),
  ('geo-u01-t09', 'geo-u01', 'Vulcanicity', 9),
  ('geo-u01-t10', 'geo-u01', 'Landform Occurrence', 10),
  ('geo-u01-t11', 'geo-u01', 'Geomorphic Hazards: Earthquakes and Volcanoes', 11),
  ('geo-u01-t12', 'geo-u01', 'Geomorphic Hazards: Landslides and Avalanches', 12),
  ('geo-u02-t01', 'geo-u02', 'Composition and Structure of Atmosphere', 1),
  ('geo-u02-t02', 'geo-u02', 'Insolation and Heat Budget of Earth', 2),
  ('geo-u02-t03', 'geo-u02', 'Temperature', 3),
  ('geo-u02-t04', 'geo-u02', 'Pressure and Winds', 4),
  ('geo-u02-t05', 'geo-u02', 'Air Masses and Fronts', 5),
  ('geo-u02-t06', 'geo-u02', 'Atmospheric Circulation (General and Upper Air)', 6),
  ('geo-u02-t07', 'geo-u02', 'Cyclones and Anticyclones (Tropical and Temperate)', 7),
  ('geo-u02-t08', 'geo-u02', 'Koppen Climatic Classification', 8),
  ('geo-u02-t09', 'geo-u02', 'Thornthwaite Climatic Classification', 9),
  ('geo-u02-t10', 'geo-u02', 'ENSO Events (El Nino, La Nina, Southern Oscillation)', 10),
  ('geo-u02-t11', 'geo-u02', 'Meteorological Hazards: Cyclones, Thunderstorms, Tornadoes, Hailstorms', 11),
  ('geo-u02-t12', 'geo-u02', 'Meteorological Hazards: Heat and Cold Waves, Drought, Cloudburst, GLOF', 12),
  ('geo-u02-t13', 'geo-u02', 'Climate Change: Evidences and Causes in the Past', 13),
  ('geo-u02-t14', 'geo-u02', 'Human Impact on Global Climate', 14),
  ('geo-u03-t01', 'geo-u03', 'Relief of Oceans', 1),
  ('geo-u03-t02', 'geo-u03', 'Temperature of Oceans', 2),
  ('geo-u03-t03', 'geo-u03', 'Density and Salinity', 3),
  ('geo-u03-t04', 'geo-u03', 'Warm and Cold Currents', 4),
  ('geo-u03-t05', 'geo-u03', 'Waves', 5),
  ('geo-u03-t06', 'geo-u03', 'Tides', 6),
  ('geo-u03-t07', 'geo-u03', 'Sea Level Changes', 7),
  ('geo-u03-t08', 'geo-u03', 'Hazards: Tsunami', 8),
  ('geo-u03-t09', 'geo-u03', 'Hazards: Cyclone', 9),
  ('geo-u04-t01', 'geo-u04', 'Ecosystem: Geographic Classification', 1),
  ('geo-u04-t02', 'geo-u04', 'Human Ecology', 2),
  ('geo-u04-t03', 'geo-u04', 'Trophic Levels and Energy Flows', 3),
  ('geo-u04-t04', 'geo-u04', 'Biogeochemical Cycles (Geo-chemical, Carbon, Nitrogen, Oxygen)', 4),
  ('geo-u04-t05', 'geo-u04', 'Food Chain, Food Web and Ecological Pyramid', 5),
  ('geo-u04-t06', 'geo-u04', 'Human Interaction and Impacts', 6),
  ('geo-u04-t07', 'geo-u04', 'Environmental Ethics and Deep Ecology', 7),
  ('geo-u04-t08', 'geo-u04', 'Global Warming and Urban Heat Island', 8),
  ('geo-u04-t09', 'geo-u04', 'Atmospheric Pollution', 9),
  ('geo-u04-t10', 'geo-u04', 'Water Pollution', 10),
  ('geo-u04-t11', 'geo-u04', 'Land Degradation', 11),
  ('geo-u04-t12', 'geo-u04', 'National Programmes, Legal Framework and Environmental Policy', 12),
  ('geo-u04-t13', 'geo-u04', 'Brundtland Commission, Agenda 21 and Sustainable Development Goals', 13),
  ('geo-u04-t14', 'geo-u04', 'Kyoto Protocol and Paris Agreement', 14),
  ('geo-u05-t01', 'geo-u05', 'Sources of Population Data', 1),
  ('geo-u05-t02', 'geo-u05', 'World Population Distribution', 2),
  ('geo-u05-t03', 'geo-u05', 'World Population Growth', 3),
  ('geo-u05-t04', 'geo-u05', 'Demographic Transition', 4),
  ('geo-u05-t05', 'geo-u05', 'Theories of Population Growth (Malthus, Sadler, Ricardo)', 5),
  ('geo-u05-t06', 'geo-u05', 'Fertility Analysis', 6),
  ('geo-u05-t07', 'geo-u05', 'Mortality Analysis', 7),
  ('geo-u05-t08', 'geo-u05', 'Migration', 8),
  ('geo-u05-t09', 'geo-u05', 'Population Composition and Characteristics', 9),
  ('geo-u05-t10', 'geo-u05', 'Population Policies', 10),
  ('geo-u05-t11', 'geo-u05', 'Rural Settlements: Types, Patterns and Distribution', 11),
  ('geo-u05-t12', 'geo-u05', 'Contemporary Problems of Rural Settlements', 12),
  ('geo-u05-t13', 'geo-u05', 'Theories of Origin of Towns', 13),
  ('geo-u05-t14', 'geo-u05', 'Urbanization in Developed and Developing Countries', 14),
  ('geo-u05-t15', 'geo-u05', 'Urban Systems (Primate City, Rank Size Rule)', 15),
  ('geo-u05-t16', 'geo-u05', 'Central Place Theories (Christaller and Losch)', 16),
  ('geo-u05-t17', 'geo-u05', 'Internal Structure of City and Urban Land Use Models', 17),
  ('geo-u05-t18', 'geo-u05', 'Megacities, Global Cities and Edge Cities', 18),
  ('geo-u05-t19', 'geo-u05', 'Changing Urban Forms', 19),
  ('geo-u05-t20', 'geo-u05', 'Social Segregation and Urban Social Area Analysis', 20),
  ('geo-u05-t21', 'geo-u05', 'Manifestation of Poverty in the City', 21),
  ('geo-u06-t01', 'geo-u06', 'Spatial Organisation of Economic Activities', 1),
  ('geo-u06-t02', 'geo-u06', 'Natural Resources: Classification, Distribution and Problems', 2),
  ('geo-u06-t03', 'geo-u06', 'Natural Resources Management', 3),
  ('geo-u06-t04', 'geo-u06', 'World Energy Crises', 4),
  ('geo-u06-t05', 'geo-u06', 'Land Capability Classification and Land Use Planning', 5),
  ('geo-u06-t06', 'geo-u06', 'Crop Combination Regions (Weaver, Doi, Rafiullah)', 6),
  ('geo-u06-t07', 'geo-u06', 'Crop Diversification', 7),
  ('geo-u06-t08', 'geo-u06', 'Von Thunen''s Model', 8),
  ('geo-u06-t09', 'geo-u06', 'Agricultural Productivity: Measurement, Determinants and Regional Variations', 9),
  ('geo-u06-t10', 'geo-u06', 'Agricultural Systems of the World', 10),
  ('geo-u06-t11', 'geo-u06', 'Classification and Location Factors of Industries', 11),
  ('geo-u06-t12', 'geo-u06', 'Theories of Industrial Location', 12),
  ('geo-u06-t13', 'geo-u06', 'World Industrial Regions', 13),
  ('geo-u06-t14', 'geo-u06', 'Globalisation and Manufacturing in Less Developed Countries', 14),
  ('geo-u06-t15', 'geo-u06', 'Tourism Industry', 15),
  ('geo-u06-t16', 'geo-u06', 'ICT and Knowledge Production Industries', 16),
  ('geo-u06-t17', 'geo-u06', 'Spatial Interaction Theories and Models', 17),
  ('geo-u06-t18', 'geo-u06', 'Connectivity and Accessibility Measures', 18),
  ('geo-u06-t19', 'geo-u06', 'Gravity Model and Spatial Flow Models', 19),
  ('geo-u06-t20', 'geo-u06', 'WTO, Globalisation, Liberalisation and World Trade Patterns', 20),
  ('geo-u06-t21', 'geo-u06', 'Inter and Intra Regional Cooperation and Trade', 21),
  ('geo-u06-t22', 'geo-u06', 'Typology of Regions (Formal and Functional)', 22),
  ('geo-u06-t23', 'geo-u06', 'World Regional Disparities', 23),
  ('geo-u06-t24', 'geo-u06', 'Theories of Regional Development', 24),
  ('geo-u06-t25', 'geo-u06', 'Dependency Theory and Global Economic Blocs', 25),
  ('geo-u06-t26', 'geo-u06', 'Regional Development and Social Movements in India', 26),
  ('geo-u07-t01', 'geo-u07', 'Culture, Cultural Complexes, Areas and Regions', 1),
  ('geo-u07-t02', 'geo-u07', 'Cultural Heritage', 2),
  ('geo-u07-t03', 'geo-u07', 'Cultural Ecology and Cultural Convergence', 3),
  ('geo-u07-t04', 'geo-u07', 'Social Structure and Processes', 4),
  ('geo-u07-t05', 'geo-u07', 'Social Well-being, Quality of Life and Social Exclusion', 5),
  ('geo-u07-t06', 'geo-u07', 'Spatial Distribution of Social Groups in India', 6),
  ('geo-u07-t07', 'geo-u07', 'Environment, Human Health and Disease Ecology', 7),
  ('geo-u07-t08', 'geo-u07', 'Nutritional Status', 8),
  ('geo-u07-t09', 'geo-u07', 'Health Care Planning, Policies and Medical Tourism in India', 9),
  ('geo-u07-t10', 'geo-u07', 'Boundaries and Frontiers', 10),
  ('geo-u07-t11', 'geo-u07', 'Heartland and Rimland Theories', 11),
  ('geo-u07-t12', 'geo-u07', 'Trends and Developments in Political Geography', 12),
  ('geo-u07-t13', 'geo-u07', 'Geography of Federalism', 13),
  ('geo-u07-t14', 'geo-u07', 'Electoral Reforms and Electoral Behaviour', 14),
  ('geo-u07-t15', 'geo-u07', 'Geopolitics of Climate Change and World Resources', 15),
  ('geo-u07-t16', 'geo-u07', 'Geopolitics of Indian Ocean', 16),
  ('geo-u07-t17', 'geo-u07', 'Regional Organisations of Cooperation', 17),
  ('geo-u08-t01', 'geo-u08', 'Greek and Roman Scholars', 1),
  ('geo-u08-t02', 'geo-u08', 'Arab, Chinese and Indian Scholars', 2),
  ('geo-u08-t03', 'geo-u08', 'Contributions of Geographers (Varenius, Kant, Humboldt, Ritter, Schaefer, Hartshorne)', 3),
  ('geo-u08-t04', 'geo-u08', 'Impact of Darwinian Theory', 4),
  ('geo-u08-t05', 'geo-u08', 'Contemporary Trends in Indian Geography', 5),
  ('geo-u08-t06', 'geo-u08', 'Major Geographic Traditions', 6),
  ('geo-u08-t07', 'geo-u08', 'Dualisms in Geographic Studies', 7),
  ('geo-u08-t08', 'geo-u08', 'Paradigm Shift', 8),
  ('geo-u08-t09', 'geo-u08', 'Perspectives in Geography', 9),
  ('geo-u09-t01', 'geo-u09', 'Sources of Geographic Information and Data', 1),
  ('geo-u09-t02', 'geo-u09', 'Types of Maps', 2),
  ('geo-u09-t03', 'geo-u09', 'Techniques of Map Making', 3),
  ('geo-u09-t04', 'geo-u09', 'Data Representation on Maps and Diagrams', 4),
  ('geo-u09-t05', 'geo-u09', 'GIS Database and Data Formats', 5),
  ('geo-u09-t06', 'geo-u09', 'Functions of GIS', 6),
  ('geo-u09-t07', 'geo-u09', 'Digital Elevation Model', 7),
  ('geo-u09-t08', 'geo-u09', 'Georeferencing: Coordinates, Projections and Datum', 8),
  ('geo-u09-t09', 'geo-u09', 'GIS Applications', 9),
  ('geo-u09-t10', 'geo-u09', 'Basics of Remote Sensing', 10),
  ('geo-u09-t11', 'geo-u09', 'Image Interpretation and Photogrammetry', 11),
  ('geo-u09-t12', 'geo-u09', 'Digital Image Processing and Remote Sensing Applications', 12),
  ('geo-u09-t13', 'geo-u09', 'GPS', 13),
  ('geo-u09-t14', 'geo-u09', 'Central Tendency, Dispersion and Inequalities', 14),
  ('geo-u09-t15', 'geo-u09', 'Sampling and Hypothesis Testing', 15),
  ('geo-u09-t16', 'geo-u09', 'Time Series, Correlation and Regression', 16),
  ('geo-u09-t17', 'geo-u09', 'Indices, Composite Index, PCA and Cluster Analysis', 17),
  ('geo-u09-t18', 'geo-u09', 'Morphometric Analysis', 18),
  ('geo-u09-t19', 'geo-u09', 'Profiles, Slope Analysis and Hypsometric Curves', 19),
  ('geo-u10-t01', 'geo-u10', 'Physiographic Regions', 1),
  ('geo-u10-t02', 'geo-u10', 'Drainage System', 2),
  ('geo-u10-t03', 'geo-u10', 'Seasonal Weather and Climatic Divisions', 3),
  ('geo-u10-t04', 'geo-u10', 'Indian Monsoon', 4),
  ('geo-u10-t05', 'geo-u10', 'Jet Streams and Himalayan Cryosphere', 5),
  ('geo-u10-t06', 'geo-u10', 'Natural Resources: Soil and Vegetation', 6),
  ('geo-u10-t07', 'geo-u10', 'Natural Resources: Water, Mineral and Marine', 7),
  ('geo-u10-t08', 'geo-u10', 'Population Distribution, Growth and Composition', 8),
  ('geo-u10-t09', 'geo-u10', 'Determinants of Population and Population Policies', 9),
  ('geo-u10-t10', 'geo-u10', 'Agriculture: Production, Productivity and Yield', 10),
  ('geo-u10-t11', 'geo-u10', 'Major Crop Regions and Regional Variations', 11),
  ('geo-u10-t12', 'geo-u10', 'Factors Affecting Indian Agriculture', 12),
  ('geo-u10-t13', 'geo-u10', 'Agro-Climatic Zones, Green Revolution and Food Security', 13),
  ('geo-u10-t14', 'geo-u10', 'Industrial Development, Regions and Policies', 14),
  ('geo-u10-t15', 'geo-u10', 'Transport Networks', 15),
  ('geo-u10-t16', 'geo-u10', 'Internal and External Trade', 16),
  ('geo-u10-t17', 'geo-u10', 'Regional Development Planning', 17),
  ('geo-u10-t18', 'geo-u10', 'Globalisation and Indian Economy', 18),
  ('geo-u10-t19', 'geo-u10', 'Natural Disasters in India', 19)
on conflict (id) do update set name = excluded.name, sort = excluded.sort;
