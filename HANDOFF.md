# HANDOFF — Automatización EDITCHEAP (Notion ↔ Discord)

Estado real a 2026-07-08. Léelo entero antes de tocar nada. Escrito para que cualquier
sesión nueva de Claude Code (este PC, el portátil de Jorge, o cualquier otro) entienda el
proyecto sin que Jorge tenga que volver a explicarlo. Jorge no tiene formación técnica —
explicaciones simples, un paso cada vez, confirmar con datos reales antes de avanzar.

## 1. Qué es esto

EDITCHEAP (negocio de edición de vídeo de Jorge) usa Notion como ERP (base "📥 Pedidos") y
Discord como canal para ofrecer colaboraciones a editores externos. Este proyecto automatiza:
cuando un pedido se marca "Enviar a Discord" en Notion, se publica solo en el canal de
Discord `trabajos-editor-sm-cm`, sin intervención manual.

Se abandonaron dos vías anteriores antes de esta (no reintentar):
- **Make.com**: plan gratuito limita a 1 escenario activo, y un Router de 3 ramas construido
  vía API nunca funcionó en tiempo de ejecución (causa raíz nunca identificada).
- **Google Apps Script**: Discord/Cloudflare bloquea sistemáticamente las peticiones salientes
  de `UrlFetchApp` (error `40333`, issue conocido de Google). No es viable.

La vía actual es código Node.js normal llamando directo a las APIs REST de Notion y Discord,
ejecutado por GitHub Actions (nube, gratis).

## 2. Dónde está todo

- **Código**: repositorio privado de GitHub `editcheapes-code/editcheap-automatizacion`
  (rama `master`). Script principal: `pasos/procesar-pedidos.js`. Los demás archivos en
  `pasos/` (`paso1-*`, `paso2-*`, `paso3-*`, `diagnostico-discord.js`,
  `debug-listar-campos.js`) son los scripts de prueba incrementales usados para validar cada
  pieza — el que corre de verdad es `procesar-pedidos.js`.
- **Automatización real**: workflow de GitHub Actions en
  `.github/workflows/procesar-pedidos.yml`, pensado para correr cada 5 min.
- **Secretos** (guardados en GitHub → Settings → Secrets and variables → Actions, NUNCA en
  el código ni en el chat): `NOTION_TOKEN`, `NOTION_DATA_SOURCE_ID`, `DISCORD_BOT_TOKEN`,
  `DISCORD_CHANNEL_ID`. Ya están todos configurados.
- **Cuenta de GitHub de Jorge**: usuario `editcheapes-code`.
- **Integración de Notion**: se llama "Jorge conections" (sic), con acceso a "📥 Pedidos".
- **Bot de Discord**: aplicación "Mini bot", visible en el servidor como "Editcheap Bot",
  Application ID `1523718656263983214`. Ya tiene permisos de canal correctos en
  `trabajos-editor-sm-cm` (canal ID `1397863576185606154`) — si algún día un bot nuevo da
  error 403 "Missing Access" aunque los permisos del servidor estén bien, revisar los
  permisos específicos DEL CANAL (pueden bloquear al bot aunque el servidor lo permita).

## 3. Esquema de "📥 Pedidos" que usa el script (data_source_id
`39151046-61ea-8067-96d5-000bbc45dd41`)

- `Nombre` (title), `Nº de Pedido` (auto_increment_id, solo lectura, "PED-N")
- `Tipo de servicio`: **multi_select** (se convirtió desde select). Opciones actuales:
  Instagram, TikTok, Shorts, YouTube, CM básico. NO se usa en el mensaje de Discord (se quitó
  a petición de Jorge por redundancia con "Servicios web").
- `Servicios web`: multi_select ("Pack 4 Shorts", "Edición YouTube Estándar"). **Esto es lo
  que se muestra como "🎬 Tipo de servicio" en el mensaje de Discord** (cambio de fuente
  respecto a versiones anteriores del script).
- `Deseo del cliente` (rich_text) → línea "📝 Detalles del trabajo" del mensaje.
- `Ajuste manual (€)` (number, editable) + `Precio Web (Base)` (fórmula, solo lectura) =
  `Monto total (€)` (fórmula, solo lectura). Ninguna fórmula de Notion puede referenciar a
  otra fórmula vía la herramienta MCP de Notion usada aquí ("Type error with formula") —
  limitación de esa herramienta, no de Notion en sí.
- `Importe Editor (€)` (number, normal, NO fórmula): 70% de `Monto total (€)`, calculado y
  escrito por el propio script en cada ejecución (no se recalcula sola si cambias el total a
  mano — solo se actualiza cuando el script procesa ese pedido).
- `¿Editor pagado?` (checkbox, nuevo): manual por ahora, pendiente de conectar a un pago real.
- `Enviar a Discord` (checkbox) → dispara la publicación.
- `ID Mensaje` (rich_text) → guarda el ID del mensaje de Discord ya publicado. Es la clave
  para no duplicar: el script solo procesa pedidos con `Enviar a Discord = true` Y
  `ID Mensaje` vacío.
- `Aviso Discord enviado`, `Discord eliminado`: para los pasos 6 y 7 (todavía NO
  implementados, ver sección 5).
- `Estado del pedido` (status): opción final `"7. Finalizado y Entregado"`.

## 4. Formato del mensaje de Discord (ya validado y aprobado por Jorge)

```
▬▬▬▬▬▬▬▬▬▬▬▬▬▬▬▬▬▬▬▬▬▬▬▬▬▬▬▬▬▬
🚨 ¡NUEVA COLABORACIÓN DISPONIBLE! 🚨

📌 Nº de Pedido: PED-XX
🎬 Tipo de servicio: [Servicios web]
📝 Detalles del trabajo: [Deseo del cliente]
💰 Importe para el editor: [70% de Monto total] €

⚠️ Nota: Por políticas de privacidad, los datos del cliente y el material original se
gestionan de forma privada una vez asignado el cargo y verificado el correspondiente
acuerdo de colaboración firmado.

🎯 ¿TE INTERESA ESTA COLABORACIÓN?
Si tienes disponibilidad para cargarte de este proyecto de forma externa, responde
directamente a este mensaje indicando el Nº de Pedido para proceder con la asignación.
¡A por ello! 💪
▬▬▬▬▬▬▬▬▬▬▬▬▬▬▬▬▬▬▬▬▬▬▬▬▬▬▬▬▬▬
```

No cambiar el formato sin confirmar con Jorge — ya iteramos varias veces hasta que dijo
explícitamente que le gustaba mucho el resultado.

## 5. Plan de 9 pasos — estado real

1. ✅ Enviar un mensaje fijo a Discord — hecho y confirmado.
2. ✅ Leer un pedido real de Notion — hecho y confirmado.
3. ✅ Publicar un pedido real con formato completo — hecho, formato aprobado.
4. ✅ Guardar `ID Mensaje` de vuelta en Notion — hecho, integrado en `procesar-pedidos.js`.
5. ✅ Condición "solo si Enviar a Discord=true y sin ID Mensaje" — hecho, probado dos veces
   seguidas (segunda vez encontró 0 pendientes, confirmando que no duplica).
6. ❌ **PENDIENTE**: editar el mensaje a embed verde "Pedido asignado" cuando `Editor
   principal` tiene alguien Y `Aviso Discord enviado = false`.
7. ❌ **PENDIENTE**: borrar el mensaje cuando `Estado del pedido = "7. Finalizado y
   Entregado"` Y `Discord eliminado = false` (un 404 al borrar cuenta como éxito).
8. ✅ Recorrer TODOS los pedidos pendientes, no solo uno — hecho (`obtenerPedidosPendientes`
   usa un filtro de Notion, no se limita a 1 resultado).
9. 🟡 **EN CURSO**: ejecución automática periódica. Ver sección 6.

## 6. Ejecución automática — estado y problema conocido

- Existe una tarea programada de Windows en este PC ("EDITCHEAP Automatizacion", cada 5 min,
  ejecuta `automatizacion-local/ejecutar.bat`) — **está DESACTIVADA a propósito**
  (`Disable-ScheduledTask`) para no duplicar con GitHub Actions. Jorge decidió explícitamente
  no depender de que su PC esté encendido.
- GitHub Actions (`schedule: cron '*/5 * * * *'`) funciona correctamente en cuanto a lógica
  (probado con éxito vía `workflow_dispatch` manual y también solo, sin intervención), PERO
  el cron interno de GitHub es conocido por retrasarse mucho en repos poco activos — un
  primer disparo tardó **9 horas** en lugar de 5 minutos. No es un error de sintaxis (GitHub
  Actions no admite segundos, solo minutos, y el cron escrito es correcto) — es una
  limitación real y documentada del scheduler gratuito de GitHub bajo carga.
- **Solución en curso**: un cron externo gratuito en **cron-job.org** que llama cada 5 min a
  la API de GitHub (`POST
  /repos/editcheapes-code/editcheap-automatizacion/actions/workflows/procesar-pedidos.yml/dispatches`
  con `{"ref":"master"}`) usando un token de acceso de Jorge (fine-grained, permiso
  "Actions: Read and write", solo sobre este repo). Esto evita depender del scheduler interno
  de GitHub. Pendiente de confirmar que Jorge terminó de configurarlo y que dispara de verdad
  cada 5 min.
- El trigger `schedule` de GitHub Actions se deja tal cual (no estorba, puede disparar algún
  extra ocasional gracias al filtro de deduplicación).

## 7. Cosas que Jorge pidió explícitamente y a tener en cuenta

- Cualquier pedido de prueba debe tener TODOS los campos rellenos (nombre realista, deseo del
  cliente realista, tipo de servicio, importe), para probar el flujo de verdad.
- Nunca escribir tokens/contraseñas en el chat ni en archivos del repo — solo como GitHub
  Secrets o variables de entorno de Windows.
- Jorge no tiene formación técnica: cada cambio se explica y se confirma con una prueba real
  y visible (mensaje en Discord, dato en Notion) antes de avanzar al siguiente paso.
- Jorge puede estar trabajando desde su portátil en otro momento — el código vive en GitHub
  para que cualquier sesión de Claude Code (en cualquier ordenador) pueda clonar el repo
  (`git clone https://github.com/editcheapes-code/editcheap-automatizacion.git`, requiere
  iniciar sesión de GitHub la primera vez) y continuar sin depender de este PC.

## Próximos pasos sugeridos (en orden)

1. Confirmar que cron-job.org ya dispara cada 5 min de verdad (revisar
   `gh run list -R editcheapes-code/editcheap-automatizacion` — deberían aparecer runs
   frecuentes, no solo `workflow_dispatch` manuales).
2. Implementar Paso 6 (cerrar oferta / editar mensaje a embed verde).
3. Implementar Paso 7 (borrar mensaje al finalizar pedido).
4. Limpiar los mensajes de prueba acumulados en el canal de Discord (Jorge lo pidió, se
   aplazó para seguir probando).
5. Revisar si conviene borrar/archivar `automatizacion.js` (el script antiguo, grande, nunca
   validado, que sigue en el PC pero NO está en el repo de GitHub) una vez todo esto esté
   estable.
