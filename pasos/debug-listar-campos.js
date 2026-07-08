// Ayuda de diagnóstico: lista TODOS los campos y valores de un pedido concreto.
// No forma parte de los 9 pasos, es solo para decidir qué campos usar en el mensaje.
const NOTION_TOKEN = process.env.NOTION_TOKEN;
const NOTION_DATA_SOURCE_ID = process.env.NOTION_DATA_SOURCE_ID;

async function main() {
  const url = `https://api.notion.com/v1/data_sources/${NOTION_DATA_SOURCE_ID}/query`;
  const response = await fetch(url, {
    method: 'POST',
    headers: {
      Authorization: `Bearer ${NOTION_TOKEN}`,
      'Notion-Version': '2025-09-03',
      'Content-Type': 'application/json',
    },
    body: JSON.stringify({ page_size: 1 }),
  });
  const data = await response.json();
  const p = data.results[0].properties;

  for (const [nombre, valor] of Object.entries(p)) {
    console.log(`- "${nombre}" (tipo: ${valor.type}):`, JSON.stringify(valor[valor.type]));
  }
}

main();
