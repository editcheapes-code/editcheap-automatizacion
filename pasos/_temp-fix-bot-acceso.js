// Corrige el acceso del propio bot a los 3 canales de STAFF (se perdió al simplificar permisos).
const DISCORD_BOT_TOKEN = process.env.DISCORD_BOT_TOKEN;
const BOT_ROLE_ID = '1523730561192034356';
const STAFF_ROLE_ID = '1531636660851441875';
const EVERYONE_ID = '1375827720235122698';
const PERM = 101376;

const CANALES = {
  'staff-interno': '1531621459011571743',
  'pagos-editores': '1531621467463094312',
  'moderator-only': '1398066541236453446',
};

const headers = {
  Authorization: `Bot ${DISCORD_BOT_TOKEN}`,
  'Content-Type': 'application/json',
  'User-Agent': 'DiscordBot (https://editcheap.es, 1.0)',
};

function esperar(ms) {
  return new Promise((r) => setTimeout(r, ms));
}

async function main() {
  const overwrites = [
    { id: EVERYONE_ID, type: 0, allow: '0', deny: String(PERM) },
    { id: STAFF_ROLE_ID, type: 0, allow: String(PERM), deny: '0' },
    { id: BOT_ROLE_ID, type: 0, allow: String(PERM), deny: '0' },
  ];
  for (const [nombre, id] of Object.entries(CANALES)) {
    const res = await fetch(`https://discord.com/api/v10/channels/${id}`, {
      method: 'PATCH',
      headers,
      body: JSON.stringify({ permission_overwrites: overwrites }),
    });
    const data = await res.json().catch(() => null);
    if (!res.ok) {
      console.log(`ERROR en #${nombre}: HTTP ${res.status} ${JSON.stringify(data)}`);
    } else {
      console.log(`Arreglado #${nombre}`);
    }
    await esperar(800);
  }

  // Verificar que el bot ya puede leerlos
  for (const [nombre, id] of Object.entries(CANALES)) {
    const res = await fetch(`https://discord.com/api/v10/channels/${id}`, { headers });
    const data = await res.json();
    console.log(`Verificación #${nombre}: HTTP ${res.status}`, res.ok ? JSON.stringify(data.permission_overwrites) : JSON.stringify(data));
    await esperar(800);
  }
}

main().catch((err) => {
  console.error('ERROR FATAL:', err.message);
  process.exitCode = 1;
});
