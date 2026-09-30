const { default: makeWASocket, useMultiFileAuthState, DisconnectReason, fetchLatestBaileysVersion, makeCacheableSignalKeyStore } = require("@whiskeysockets/baileys")
const P = require("pino")
const fs = require("fs")

const OWNER = "233559493860@s.whatsapp.net"
const GROUP_NAME = "AZIGI STORE HOUSE"
const WARNING_FILE = "./warnings.json"

// Load warnings
let warnings = {}
if (fs.existsSync(WARNING_FILE)) {
  try { warnings = JSON.parse(fs.readFileSync(WARNING_FILE)) } catch(e){ warnings = {} }
}
function saveWarnings() {
  fs.writeFileSync(WARNING_FILE, JSON.stringify(warnings))
}

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
      const code = await sock.requestPairingCode("233559493860")
      console.log(`PAIRING CODE: ${code}`)
    }, 5000)
  }

  sock.ev.on("connection.update", (u) => {
    if (u.connection === "close" && u.lastDisconnect?.error?.output?.statusCode!== DisconnectReason.loggedOut) start()
    if (u.connection === "open") console.log(`${GROUP_NAME} BOT ONLINE`)
  })

  // WELCOME MESSAGE
  sock.ev.on("group-participants.update", async (u) => {
    for (const p of u.participants) {
      if (u.action === "add") {
        await sock.sendMessage(u.id, {
          text: `welcome to azigi store house @${p.split("@")[0]} 🛍️\n\nWe sell affordable data & more!\nMoMo: 0559493860\n\nNo links / No advertising allowed!`,
          mentions: [p]
        })
      }
    }
  })

  // AUTO-APPROVE
  sock.ev.on("group-membership-requests.update", async (u) => {
    for (const r of u.requests) {
      await sock.groupRequestParticipantsUpdate(u.id, [r.jid], "approve")
    }
  })

  // MAIN FILTER - LINKS + MINUTES/GH
  sock.ev.on("messages.upsert", async ({ messages }) => {
    const m = messages[0]
    if (!m.message ||!m.key.remoteJid.endsWith("@g.us") || m.key.fromMe) return

    const jid = m.key.remoteJid
    const sender = m.key.participant
    const text = (m.message.conversation || m.message.extendedTextMessage?.text || m.message.imageMessage?.caption || "").toLowerCase()

    if (!text) return

    // Check 1: LINKS
    const hasLink = /https?:\/\/|www\.|chat\.whatsapp\.com|wa\.me|t\.me|bit\.ly|tinyurl/.test(text)

    // Check 2: DATA SELLING (minutes + GH/Cedis)
    // Detects: "2gb for 12gh", "10 mins 5gh", "1gb 6 cedis", "5gb - 30gh"
    const hasDataSelling = /\d/.test(text) &&
                           /(gb|gig|mins?|minutes?|data|bundle)/.test(text) &&
                           /(gh|ghs|cedi|₵|ghc)/.test(text)

    if (hasLink || hasDataSelling) {
      try {
        // Check if bot is admin
        const meta = await sock.groupMetadata(jid)
        const botIsAdmin = meta.participants.find(p => p.id === sock.user.id)?.admin
        if (!botIsAdmin) return

        // Delete message from everyone
        await sock.sendMessage(jid, { delete: m.key })

        // Warning system
        if (!warnings[sender]) warnings[sender] = 0
        warnings[sender] += 1
        saveWarnings()

        const count = warnings[sender]

        if (count < 3) {
          let reason = hasLink? "Posting links" : "Advertising data/minutes for GH"
          await sock.sendMessage(jid, {
            text: `⚠️ @${sender.split("@")[0]} WARNING ${count}/3\nReason: ${reason}\nYour message was deleted. After 3 warnings you will be removed!\n\n@${GROUP_NAME} - No advertising!`,
            mentions: [sender]
          })
          await sock.sendMessage(OWNER, { text: `⚠️ Warning ${count}/3 to ${sender} in ${jid}\nReason: ${reason}\nText: ${text}` })
        } else {
          // 3rd warning = REMOVE
          await sock.sendMessage(jid, {
            text: `🚫 @${sender.split("@")[0]} REMOVED after 3 warnings!\nReason: Repeated advertising/links`,
            mentions: [sender]
          })
          await sock.groupParticipantsUpdate(jid, [sender], "remove")
          await sock.sendMessage(OWNER, { text: `🚫 REMOVED ${sender} from ${jid} after 3 warnings\nLast text: ${text}` })
          delete warnings[sender]
          saveWarnings()
        }

      } catch(e){ console.log("delete error", e) }
    }
  })
}
start()
