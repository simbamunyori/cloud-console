import * as migration_20260929_181737_initial from './20260929_181737_initial';
import * as migration_20260929_184053_pages from './20260929_184053_pages';

export const migrations = [
  {
    up: migration_20260929_181737_initial.up,
    down: migration_20260929_181737_initial.down,
    name: '20260929_181737_initial',
  },
  {
    up: migration_20260929_184053_pages.up,
    down: migration_20260929_184053_pages.down,
    name: '20260929_184053_pages'
  },
];
