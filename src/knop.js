// Externe knop: een bluetooth-knop in de auto bedienen zonder je telefoon aan
// te raken (bijv. een controle vastleggen op je huidige positie).
//
// Er bestaat geen publieke API of SDK voor de Flitsmeister ONE, dus we spreken
// het apparaat rechtstreeks aan. Een knop kan zich op drie manieren melden en
// we ondersteunen ze alle drie, want welke het is zie je pas bij het koppelen:
//
//  1. Eigen BLE-dienst (Web Bluetooth). Chrome geeft alleen toegang tot
//     diensten die je vooraf noemt, dus proberen we de gangbare UUID's en kun
//     je er zelf één opgeven (te vinden met nRF Connect). Let op: een
//     BLE-apparaat praat met één app tegelijk — Flitsmeister moet dus los zijn.
//  2. Toetsenbord-knop (HID). Die koppel je in de bluetooth-instellingen van
//     Android zelf; Android stuurt de toetsaanslag door naar de pagina. Via
//     Web Bluetooth kan het niet: de HID-dienst staat op de blokkeerlijst.
//  3. Mediaknop (play/pauze/volgende). Die komt alleen binnen bij de app die
//     de media-sessie heeft, dus laten we daarvoor een stil geluidje loopen.

const KEY = "flitsers-knop-v1";

const DEFAULTS = {
  enabled: false,
  action: "camera", // camera = controle vastleggen, dempen = geluid aan/uit
  deviceName: "",
  serviceUuid: "", // zelf opgegeven UUID van een eigen BLE-dienst
};

// Diensten die we standaard mogen benaderen. De HID-dienst (0x1812) ontbreekt
// met opzet: die blokkeert elke browser.
export const KNOWN_SERVICES = [
  "6e400001-b5a3-f393-e0a9-e50e24dcca9e", // Nordic UART, veel gebruikt in eigen firmware
  0x180f, // batterij
  0x180a, // apparaatinformatie
  0xfff0, // veelgebruikt blok in goedkope modules
  0xffe0, // idem (HM-10 en verwanten)
];

export function loadKnop() {
  try {
    const raw = localStorage.getItem(KEY);
    return { ...DEFAULTS, ...(raw ? JSON.parse(raw) : {}) };
  } catch {
    return { ...DEFAULTS };
  }
}

export function saveKnop(partial) {
  const next = { ...loadKnop(), ...partial };
  try {
    localStorage.setItem(KEY, JSON.stringify(next));
  } catch {
    /* opslag geblokkeerd — instelling geldt dan alleen deze sessie */
  }
  return next;
}

export function bluetoothSupported() {
  return typeof navigator !== "undefined" && !!navigator.bluetooth;
}

function shortUuid(uuid) {
  return String(uuid).slice(0, 8);
}

// Koppelt een BLE-knop en luistert op elk kanaal dat uit zichzelf iets stuurt.
// Welke bytes een druk oplevert weten we niet vooraf; elk binnenkomend bericht
// telt als druk, en de ruwe bytes komen in het testlogboek te staan.
export async function connectBleButton({ serviceUuid, onPress, onLog, onStatus }) {
  if (!bluetoothSupported()) throw new Error("Deze browser kent geen Web Bluetooth.");
  const optionalServices = [...KNOWN_SERVICES];
  const extra = (serviceUuid || "").trim().toLowerCase();
  if (extra) optionalServices.push(extra);

  const device = await navigator.bluetooth.requestDevice({ acceptAllDevices: true, optionalServices });
  onLog(`Gekozen: ${device.name || "naamloos apparaat"}`);

  const subscribe = async () => {
    const server = await device.gatt.connect();
    let channels = 0;
    let services = [];
    try {
      services = await server.getPrimaryServices();
    } catch {
      services = [];
    }
    for (const svc of services) {
      let chars = [];
      try {
        chars = await svc.getCharacteristics();
      } catch {
        continue;
      }
      for (const ch of chars) {
        if (!ch.properties.notify && !ch.properties.indicate) continue;
        try {
          await ch.startNotifications();
          ch.addEventListener("characteristicvaluechanged", (e) => {
            const bytes = Array.from(new Uint8Array(e.target.value.buffer));
            onLog(`${shortUuid(ch.uuid)} → ${bytes.join(" ") || "(leeg)"}`);
            onPress("bluetooth");
          });
          channels += 1;
        } catch {
          /* kanaal weigert een abonnement — volgende proberen */
        }
      }
    }
    onLog(
      channels
        ? `Verbonden, luistert op ${channels} kanaal(en). Druk nu op de knop.`
        : "Verbonden, maar geen kanaal dat uit zichzelf iets stuurt. Vul hieronder de service-UUID in."
    );
    onStatus({ connected: true, name: device.name || "", channels });
  };

  device.addEventListener("gattserverdisconnected", () => {
    onLog("Verbinding verbroken — opnieuw verbinden…");
    onStatus({ connected: false, name: device.name || "", channels: 0 });
    // Eén herstelpoging; lukt dat niet, dan koppel je hem handmatig opnieuw.
    subscribe().catch(() => onLog("Opnieuw verbinden mislukt."));
  });

  await subscribe();
  return device;
}

// Toetsenbord-knoppen (HID). Alleen meeluisteren als je niet in een invoerveld
// typt, anders zou elke spatie in het zoekveld een melding opleveren.
export function listenKeyButton(onPress) {
  const keys = new Set(["Enter", " ", "MediaPlayPause", "MediaTrackNext", "MediaTrackPrevious"]);
  const handler = (e) => {
    const tag = (e.target && e.target.tagName) || "";
    if (tag === "INPUT" || tag === "TEXTAREA" || tag === "SELECT" || tag === "BUTTON") return;
    if (!keys.has(e.key)) return;
    e.preventDefault();
    onPress(`toets ${e.key === " " ? "spatie" : e.key}`);
  };
  window.addEventListener("keydown", handler);
  return () => window.removeEventListener("keydown", handler);
}

// Stil WAV'je (8 kHz, 8-bit mono). Nodig om de media-sessie te krijgen: alleen
// de app die iets afspeelt, ontvangt de knoppen van een bluetooth-mediaknop.
function silentWavUrl(seconds = 0.5) {
  const rate = 8000;
  const n = Math.round(rate * seconds);
  const buf = new ArrayBuffer(44 + n);
  const view = new DataView(buf);
  const ascii = (offset, text) => {
    for (let i = 0; i < text.length; i++) view.setUint8(offset + i, text.charCodeAt(i));
  };
  ascii(0, "RIFF");
  view.setUint32(4, 36 + n, true);
  ascii(8, "WAVEfmt ");
  view.setUint32(16, 16, true);
  view.setUint16(20, 1, true); // PCM
  view.setUint16(22, 1, true); // mono
  view.setUint32(24, rate, true);
  view.setUint32(28, rate, true);
  view.setUint16(32, 1, true);
  view.setUint16(34, 8, true);
  ascii(36, "data");
  view.setUint32(40, n, true);
  for (let i = 0; i < n; i++) view.setUint8(44 + i, 128); // 128 = stilte bij 8-bit
  return URL.createObjectURL(new Blob([buf], { type: "audio/wav" }));
}

// Moet vanuit een klik worden aangeroepen: afspelen mag pas na een handeling.
export async function claimMediaButtons(onPress) {
  if (typeof navigator === "undefined" || !("mediaSession" in navigator)) return () => {};
  const url = silentWavUrl();
  const audio = new Audio(url);
  audio.loop = true;
  try {
    await audio.play();
  } catch {
    URL.revokeObjectURL(url);
    return () => {};
  }
  const actions = ["play", "pause", "nexttrack", "previoustrack"];
  for (const a of actions) {
    try {
      navigator.mediaSession.setActionHandler(a, () => onPress(`mediaknop ${a}`));
    } catch {
      /* actie niet ondersteund */
    }
  }
  try {
    navigator.mediaSession.metadata = new window.MediaMetadata({
      title: "Flitsers — knop actief",
      artist: "wachten op een druk op de knop",
    });
  } catch {
    /* geen metadata — niet erg */
  }
  return () => {
    for (const a of actions) {
      try {
        navigator.mediaSession.setActionHandler(a, null);
      } catch {
        /* niets te doen */
      }
    }
    audio.pause();
    URL.revokeObjectURL(url);
  };
}
