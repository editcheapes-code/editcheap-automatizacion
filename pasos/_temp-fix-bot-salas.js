// Corrige la base de permisos de las 20 salas de reunión:
// - Acceso permanente SOLO para: kero86, editcheap (owner), y los roles de supervisor
//   (Director Editor, Editor Supervisor, Social Media Supervisor). Nada de acceso general
//   para editores normales ni clientes — eso se da por persona en el script de asignación.
// - Se incluye el propio rol del bot para que no se bloquee a sí mismo (ya pasó una vez).
const DISCORD_BOT_TOKEN = process.env.DISCORD_BOT_TOKEN;
const BOT_ROLE_ID = '1523730561192034356';
const KERO86_ID = '550072806524715058';
const EDITCHEAP_ID = '1375827144046809249';
const EVERYONE_ID = '1375827720235122698';
const SUPERVISOR_ROLES = [
  '1397836697437339708', // Director Editor
  '1397837093283041369', // Editor Supervisor
  '1397837221238673500', // Social Media Supervisor
];
const PERM_SALA = 1024 + 1048576 + 2097152 + 512; // VIEW_CHANNEL + CONNECT + SPEAK + STREAM

const SALAS = [
  '1531621397409960046', '1531621405345452135', '1531621413205577850',
  '1531659234364620892', '1531659238512787496', '1531659242757558383',
  '1531659246884618260', '1531659251053887568', '1531659255629742252',
  '1531659259748679843', '1531659263913496676', '1531659268359458906',
  '1531659272713142372', '1531659276756582530', '1531659281181442190',
  '1531659286977970219', '1531659291272941598', '1531659295228166168',
  '1531659299976384522', '1531659304052981841',
];

const headers = {
  Authorization: `Bot ${DISCORD_BOT_TOKEN}`,
  'Content-Type': 'application/json',
  'User-Agent': 'DiscordBot (https://editcheap.es, 1.0)',
};

function esperar(ms) {
  return new Promise((r) => setTimeout(r, ms));
}

function overwritesBase() {
  const list = [{ id: EVERYONE_ID, type: 0, allow: '0', deny: String(PERM_SALA) }];
  for (const roleId of SUPERVISOR_ROLES) list.push({ id: roleId, type: 0, allow: String(PERM_SALA), deny: '0' });
  list.push({ id: BOT_ROLE_ID, type: 0, allow: String(PERM_SALA), deny: '0' });
  list.push({ id: KERO86_ID, type: 1, allow: String(PERM_SALA), deny: '0' });
  list.push({ id: EDITCHEAP_ID, type: 1, allow: String(PERM_SALA), deny: '0' });
  return list;
}

async function main() {
  for (const id of SALAS) {
    const res = await fetch(`https://discord.com/api/v10/channels/${id}`, {
      method: 'PATCH',
      headers,
      body: JSON.stringify({ permission_overwrites: overwritesBase() }),
    });
    if (res.ok) {
      console.log(`Base de permisos corregida en sala ${id}`);
    } else {
      const data = await res.json().catch(() => null);
      console.log(`ERROR en ${id}: HTTP ${res.status} ${JSON.stringify(data)}`);
    }
    await esperar(700);
  }
  console.log('\nTerminado.');
}

main().catch((err) => {
  console.error('ERROR FATAL:', err.message);
  process.exitCode = 1;
});
