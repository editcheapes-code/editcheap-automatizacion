const NOTION_TOKEN = process.env.NOTION_TOKEN;
const PAGE_ID = '39851046-61ea-8071-8341-c5d4d422ba5f'; // PED-55

async function main() {
  const res = await fetch(`https://api.notion.com/v1/pages/${PAGE_ID}`, {
    headers: { Authorization: `Bearer ${NOTION_TOKEN}`, 'Notion-Version': '2025-09-03' },
  });
  const data = await res.json();
  console.log('Duración Estimada (días):', JSON.stringify(data.properties['Duración Estimada (días)']));
  console.log('Servicios web (cantidad):', data.properties['Servicios web'].relation.length);
}

main();
