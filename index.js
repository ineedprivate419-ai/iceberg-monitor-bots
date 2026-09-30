const { default: makeWASocket, useMultiFileAuthState, DisconnectReason, fetchLatestBaileysVersion, makeCacheableSignalKeyStore } = require("@whiskeysockets/baileys")
const P = require("pino")
const OWNER = "233559493860@s.whatsapp.net"

async function start() {
  const { state, saveCreds } = await useMultiFileAuthState("auth")
  const { version } = await fetchLatestBaileysVersion()
  const sock = makeWASocket({
    version,
    auth: { creds: state.creds, keys: makeCacheableSignalKeyStore(state.keys, P().child({ level: "silent" })) },
    logger: P({ level: "silent" }),
    browser: ["Ubuntu", "Chrome", "22.04"]
  })
  sock.ev.on("creds.update", saveCreds)

  if (!sock.authState.creds.registered) {
    setTimeout(async () => {
      try {
        const code = await sock.requestPairingCode("233559493860")
        console.log("=================================")
        console.log(`PAIRING CODE: ${code}`)
        console.log("WhatsApp > Linked Devices > Link with phone number")
        console.log("=================================")
      } catch(e){ console.log("Pairing error", e) }
    }, 5000)
  }

  sock.ev.on("connection.update", (u) => {
    const { connection, lastDisconnect } = u
    if (connection === "close") {
      const shouldReconnect = lastDisconnect?.error?.output?.statusCode!== DisconnectReason.loggedOut
      if (shouldReconnect) start()
    }
    if (connection === "open") {
      console.log("ICEBERG MONITOR ONLINE 0559493860")
    }
  })

  sock.ev.on("group-participants.update", async (u) => {
    try {
      for (const p of u.participants) {
        if (u.action === "add") {
          await sock.sendMessage(u.id, { text: `Welcome @${p.split("@")[0]} to Iceberg Data Hub 🧊 MoMo: 0559493860`, mentions: [p] })
          await sock.sendMessage(OWNER, { text: `JOINED: ${p} in ${u.id}` })
        }
        if (u.action === "remove") {
          await sock.sendMessage(OWNER, { text: `LEFT: ${p} from ${u.id}` })
        }
      }
    } catch(e){}
  })

  sock.ev.on("group-membership-requests.update", async (u) => {
    try {
      for (const r of u.requests) {
        await sock.groupRequestParticipantsUpdate(u.id, [r.jid], "approve")
        await sock.sendMessage(OWNER, { text: `APPROVED: ${r.jid}` })
      }
    } catch(e){}
  })

  sock.ev.on("messages.upsert", async ({ messages }) => {
    const m = messages[0]
    if (!m.message) return
    if (!m.key.remoteJid.endsWith("@g.us")) return
    const text = m.message.conversation || m.message.extendedTextMessage?.text || ""
    console.log(`GROUP MSG: ${text}`)
    if (text.includes("https://") || text.includes("chat.whatsapp.com")) {
      try { await sock.sendMessage(m.key.remoteJid, { delete: m.key }) } catch(e){}
    }
  })
}
start()
