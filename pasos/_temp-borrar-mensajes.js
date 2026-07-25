// Script temporal de un solo uso: borra los mensajes de prueba identificados en la auditoría.
// Se borra después de usarlo, no es parte de la automatización permanente.
const DISCORD_BOT_TOKEN = process.env.DISCORD_BOT_TOKEN;
const DISCORD_CHANNEL_ID = process.env.DISCORD_CHANNEL_ID;

const IDS_A_BORRAR = [
  '1524470444974018560', // primer mensaje de prueba (8 julio, sin texto)
  '1524835228542304356', // PED-60, huérfano, pedido ya no existe en Notion
  '1524835238428283053', // PED-59, huérfano, pedido de prueba vacío
  '1524835249605967943', // PED-58, huérfano, pedido ya no existe en Notion
  '1525177414601277530', // respuesta "YOP" al mensaje de PED-58
  '1526594025753284800', // respuesta huérfana, su mensaje original ya no existe
];

const headers = {
  Authorization: `Bot ${DISCORD_BOT_TOKEN}`,
  'User-Agent': 'DiscordBot (https://editcheap.es, 1.0)',
};

function esperar(ms) {
  return new Promise((resolve) => setTimeout(resolve, ms));
}

async function main() {
  for (const id of IDS_A_BORRAR) {
    const url = `https://discord.com/api/v10/channels/${DISCORD_CHANNEL_ID}/messages/${id}`;
    const response = await fetch(url, { method: 'DELETE', headers });
    if (response.ok || response.status === 404) {
      console.log(`Borrado (o ya no existía): ${id}`);
    } else {
      console.log(`ERROR borrando ${id}: HTTP ${response.status} ${await response.text()}`);
    }
    await esperar(800);
  }
}

main();
