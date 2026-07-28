// Añade a kero86 como overwrite de MIEMBRO (no de rol) en los 3 canales de STAFF, ya que los
// overwrites por rol no se están aplicando de forma fiable ahora mismo. Verifica también que
// el bot recuperó el acceso (Jorge lo añadió como miembro manualmente desde la UI).
const DISCORD_BOT_TOKEN = process.env.DISCORD_BOT_TOKEN;
const KERO86_ID = '550072806524715058';
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
  // 1. Verificar que el bot ya puede ver los canales (Jorge lo añadió como miembro a mano)
  for (const [nombre, id] of Object.entries(CANALES)) {
    const res = await fetch(`https://discord.com/api/v10/channels/${id}`, { headers });
    const data = await res.json();
    if (!res.ok) {
      console.log(`El bot SIGUE sin ver #${nombre}: HTTP ${res.status} ${JSON.stringify(data)}`);
    } else {
      console.log(`El bot ya ve #${nombre}. Overwrites actuales: ${JSON.stringify(data.permission_overwrites)}`);
    }
    await esperar(700);
  }

  // 2. Añadir a kero86 como overwrite de MIEMBRO (además de su rol Staff, que se deja tal cual)
  for (const [nombre, id] of Object.entries(CANALES)) {
    const res = await fetch(`https://discord.com/api/v10/channels/${id}/permissions/${KERO86_ID}`, {
      method: 'PUT',
      headers,
      body: JSON.stringify({ type: 1, allow: String(PERM), deny: '0' }),
    });
    if (res.ok || res.status === 204) {
      console.log(`kero86 añadido como miembro en #${nombre}`);
    } else {
      const data = await res.json().catch(() => null);
      console.log(`ERROR añadiendo kero86 en #${nombre}: HTTP ${res.status} ${JSON.stringify(data)}`);
    }
    await esperar(800);
  }

  console.log('\nTerminado.');
}

main().catch((err) => {
  console.error('ERROR FATAL:', err.message);
  process.exitCode = 1;
});
