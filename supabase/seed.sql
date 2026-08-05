insert into public.initial_treatment_templates (key, version, config_json)
values (
  'lucas-2026',
  1,
  jsonb_build_object(
    'name', 'Tratamento Adaptativo do Lucas',
    'startDate', '2026-08-06',
    'timezone', 'America/Sao_Paulo',
    'medicalMarginsPolicy', 'never_infer',
    'medications', jsonb_build_array(
      jsonb_build_object('slug','nexium','name','Nexium / esomeprazol 40 mg','startDate','2026-08-06','endDate',null,'dosesPerDay',1,'targetIntervalMinutes',null,'minimumIntervalMinutes',null,'maximumIntervalMinutes',null),
      jsonb_build_object('slug','nac','name','NAC 600 mg','startDate','2026-08-06','endDate','2026-08-19','dosesPerDay',2,'targetIntervalMinutes',null,'minimumIntervalMinutes',null,'maximumIntervalMinutes',null),
      jsonb_build_object('slug','rifaximina','name','Rifaximina 550 mg','startDate','2026-08-06','endDate','2026-08-19','dosesPerDay',2,'targetIntervalMinutes',720,'minimumIntervalMinutes',null,'maximumIntervalMinutes',null),
      jsonb_build_object('slug','metronidazol','name','Metronidazol 250 mg','startDate','2026-08-06','endDate','2026-08-19','dosesPerDay',3,'targetIntervalMinutes',480,'minimumIntervalMinutes',null,'maximumIntervalMinutes',null),
      jsonb_build_object('slug','berberina-caprilico','name','Berberina + Caprílico','phases',jsonb_build_array(jsonb_build_object('name','Fase 1','startDate','2026-08-06','endDate','2026-08-20','dosesPerDay',2),jsonb_build_object('name','Fase 2','startDate','2026-08-21','endDate','2026-10-04','dosesPerDay',1))),
      jsonb_build_object('slug','oleo-oregano','name','Óleo de orégano 250 mg','startDate','2026-08-06','endDate','2026-09-04','dosesPerDay',1,'leadTimeBeforeDinnerMinutes',null)
    )
  )
)
on conflict (key) do update set version = excluded.version, config_json = excluded.config_json;
