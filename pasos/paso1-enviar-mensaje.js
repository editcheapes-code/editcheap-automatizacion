// PASO 1 — Enviar un único mensaje fijo a Discord, sin Notion de por medio.
// Objetivo: confirmar que el token del bot y el ID de canal funcionan.
//
// Ejecutar: node pasos/paso1-enviar-mensaje.js
// Necesita las variables de entorno DISCORD_BOT_TOKEN y DISCORD_CHANNEL_ID
// (ya configuradas en este PC como variables de usuario de Windows).

const DISCORD_BOT_TOKEN = process.env.DISCORD_BOT_TOKEN;
const DISCORD_CHANNEL_ID = process.env.DISCORD_CHANNEL_ID;

async function main() {
  if (!DISCORD_BOT_TOKEN || !DISCORD_CHANNEL_ID) {
    console.error('ERROR: faltan las variables de entorno DISCORD_BOT_TOKEN y/o DISCORD_CHANNEL_ID.');
    process.exitCode = 1;
    return;
  }

  const url = `https://discord.com/api/v10/channels/${DISCORD_CHANNEL_ID}/messages`;

  const response = await fetch(url, {
    method: 'POST',
    headers: {
      Authorization: `Bot ${DISCORD_BOT_TOKEN}`,
      'Content-Type': 'application/json',
      'User-Agent': 'DiscordBot (https://editcheap.es, 1.0)',
    },
    body: JSON.stringify({ content: 'Prueba desde Claude Code' }),
  });

  const data = await response.json().catch(() => ({}));

  if (!response.ok) {
    console.error(`FALLO. Discord respondió con código HTTP ${response.status}:`);
    console.error(JSON.stringify(data, null, 2));
    process.exitCode = 1;
    return;
  }

  console.log('EXITO. Mensaje enviado a Discord.');
  console.log('ID del mensaje devuelto por Discord:', data.id);
}

main();
