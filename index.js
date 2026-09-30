const { default: makeWASocket, useMultiFileAuthState, DisconnectReason, fetchLatestBaileysVersion, makeCacheableSignalKeyStore } = require("@whiskeysockets/baileys")
const P = require("pino")
const fs = require("fs")
const http = require("http")

// Simple server to keep Render alive (no express needed)
http.createServer((req,res)=> res.end("Azigi IT Bot Online - Unlimited Login")).listen(process.env.PORT || 3000, ()=> console.log("Server alive"))

let warnings = {}
if (fs.existsSync("./warnings.json")) { try { warnings = JSON.parse(fs.readFileSync("./warnings.json")) } catch(e){} }
const save = () => fs.writeFileSync("./warnings.json", JSON.stringify(warnings))

if (process.env.SESSION_ID) {
  console.log("Restoring session from ENV...")
  if (!fs.existsSync("./auth")) fs.mkdirSync("./auth", {recursive:true})
  try {
    const sessionData = JSON.parse(Buffer.from(process.env.SESSION_ID, "base64").toString())
    fs.writeFileSync("./auth/creds.json", JSON.stringify(sessionData, null, 2))
  } catch(e){ console.log("SESSION_ID invalid") }
}

async function start() {
  const { state, saveCreds } = await useMultiFileAuthState("auth")
  const { version } = await fetchLatestBaileysVersion()
  const sock = makeWASocket({
    version,
    auth: { creds: state.creds, keys: makeCacheableSignalKeyStore(state.keys, P().child({ level: "silent" })) },
    logger: P({ level: "silent" }),
    browser: ["Azigi Store House", "Chrome", "1.0"]
  })
  sock.ev.on("creds.update", async () => {
    await saveCreds()
    try {
      if (fs.existsSync("./auth/creds.json")) {
        const data = fs.readFileSync("./auth/creds.json")
        const b64 = Buffer.from(data).toString("base64")
        console.log("\n=== YOUR PERMANENT SESSION_ID (Copy to Render ENV) ===")
        console.log(b64)
        console.log("=== END SESSION_ID ===\n")
      }
    } catch(e){}
  })

  if (!sock.authState.creds.registered) {
    setTimeout(async()=>{
      const code = await sock.requestPairingCode("233559493860")
      console.log(`\n=== PAIRING CODE: ${code} ===\n`)
    },3000)
  }
  sock.ev.on("connection.update", u=>{
    if(u.connection==="close" && u.lastDisconnect?.error?.output?.statusCode!==DisconnectReason.loggedOut) start()
    if(u.connection==="open") console.log("AZIGI BOT ONLINE - UNLIMITED")
  })

  sock.ev.on("group-participants.update", async u=>{
    for(const p of u.participants) if(u.action==="add"){
      await sock.sendMessage(u.id,{text:`welcome to azigi store house @${p.split("@")[0]} 🎓\nIT Education: share tutorials, coding videos, screenshots`,mentions:[p]})
    }
  })
  sock.ev.on("group-membership-requests.update", async u=>{
    for(const r of u.requests) await sock.groupRequestParticipantsUpdate(u.id,[r.jid],"approve")
  })

  sock.ev.on("messages.upsert", async ({messages})=>{
    const m = messages[0]
    if(!m.message || m.key.fromMe ||!m.key.remoteJid.endsWith("@g.us")) return
    const jid = m.key.remoteJid
    const sender = m.key.participant
    const msgType = Object.keys(m.message)[0]
    const isMedia = ["imageMessage","videoMessage","documentMessage"].includes(msgType)
    const text = (m.message.conversation || m.message.extendedTextMessage?.text || m.message.imageMessage?.caption || m.message.videoMessage?.caption || "").toLowerCase()
    const hasLink = /https?:\/\/|www\.|chat\.whatsapp\.com|wa\.me|t\.me|bit\.ly/i.test(text)
    const isYoutube = /youtube\.com|youtu\.be/i.test(text)
    const hasPhone = /(0[235][0-9]{8}|\+233[0-9]{9})/i.test(text)
    const hasLocation = /(location|kaneshie|cocoa|clinic|my place|host|hotel|come to|junction)/i.test(text)
    const hasHookup = /(hookup|sex|nude|raw|bj|doggy|romance|escort|prostitute)/i.test(text)
    const hasDataSell = /\d/.test(text) && /(gb|bundle|data|mins)/i.test(text) && /(gh|cedi|₵)/i.test(text)
    const hasSpiritual = /(spiritual|mallam|juju|sakawa|money ritual|lotto|lottery|native doctor|charm|instant money|double money)/i.test(text)
    const hasPorn = /(porn|xxx|sex video|blue film)/i.test(text)

    let shouldDelete = false; let reason = ""
    if (isMedia) {
      if (hasPhone && hasLocation) { shouldDelete = true; reason = "Media with phone + location" }
      else if (hasHookup || hasPorn) { shouldDelete = true; reason = "Hookup/Porn media" }
      else if (hasSpiritual) { shouldDelete = true; reason = "Spiritual spam" }
      else if (hasDataSell) { shouldDelete = true; reason = "Data selling" }
      else if (hasLink &&!isYoutube) { shouldDelete = true; reason = "Non-tutorial link" }
    } else {
      if (hasLink &&!isYoutube) { shouldDelete = true; reason = "Links (only YouTube allowed)" }
      else if (hasPhone && hasLocation) { shouldDelete = true; reason = "Hookup ad" }
      else if (hasHookup || hasPorn) { shouldDelete = true; reason = "Adult content" }
      else if (hasSpiritual) { shouldDelete = true; reason = "Spiritual/mallam spam" }
      else if (hasDataSell) { shouldDelete = true; reason = "Data selling" }
    }

    if (shouldDelete) {
      try {
        const meta = await sock.groupMetadata(jid)
        if (!meta.participants.find(p=>p.id===sock.user.id)?.admin) return
        await sock.sendMessage(jid, { delete: m.key })
        if (!warnings[sender]) warnings[sender] = 0
        warnings[sender]++; save()
        if (warnings[sender] < 3) {
          await sock.sendMessage(jid, { text: `⚠️ @${sender.split("@")[0]} WARNING ${warnings[sender]}/3\nReason: ${reason}`, mentions: [sender] })
        } else {
          await sock.sendMessage(jid, { text: `🚫 @${sender.split("@")[0]} REMOVED after 3 warnings`, mentions: [sender] })
          await sock.groupParticipantsUpdate(jid, [sender], "remove")
          delete warnings[sender]; save()
        }
      } catch(e){}
    }
  })
}
start()
