import * as migration_20260929_181737_initial from './20260929_181737_initial';
import * as migration_20260929_184053_pages from './20260929_184053_pages';
import * as migration_20260929_193749_cms_site from './20260929_193749_cms_site';
import * as migration_20260930_124108_site_editor_complete from './20260930_124108_site_editor_complete';
import * as migration_20260930_134737_home_page_as_designed from './20260930_134737_home_page_as_designed';
import * as migration_20260930_153411_proof_content from './20260930_153411_proof_content';
import * as migration_20260930_170517_sales_assistant from './20260930_170517_sales_assistant';
import * as migration_20261001_084742_partner_links from './20261001_084742_partner_links';
import * as migration_20261006_130632_u2_positioning from './20261006_130632_u2_positioning';

export const migrations = [
  {
    up: migration_20260929_181737_initial.up,
    down: migration_20260929_181737_initial.down,
    name: '20260929_181737_initial',
  },
  {
    up: migration_20260929_184053_pages.up,
    down: migration_20260929_184053_pages.down,
    name: '20260929_184053_pages',
  },
  {
    up: migration_20260929_193749_cms_site.up,
    down: migration_20260929_193749_cms_site.down,
    name: '20260929_193749_cms_site',
  },
  {
    up: migration_20260930_124108_site_editor_complete.up,
    down: migration_20260930_124108_site_editor_complete.down,
    name: '20260930_124108_site_editor_complete',
  },
  {
    up: migration_20260930_134737_home_page_as_designed.up,
    down: migration_20260930_134737_home_page_as_designed.down,
    name: '20260930_134737_home_page_as_designed',
  },
  {
    up: migration_20260930_153411_proof_content.up,
    down: migration_20260930_153411_proof_content.down,
    name: '20260930_153411_proof_content',
  },
  {
    up: migration_20260930_170517_sales_assistant.up,
    down: migration_20260930_170517_sales_assistant.down,
    name: '20260930_170517_sales_assistant',
  },
  {
    up: migration_20261001_084742_partner_links.up,
    down: migration_20261001_084742_partner_links.down,
    name: '20261001_084742_partner_links',
  },
  {
    up: migration_20261006_130632_u2_positioning.up,
    down: migration_20261006_130632_u2_positioning.down,
    name: '20261006_130632_u2_positioning'
  },
];
