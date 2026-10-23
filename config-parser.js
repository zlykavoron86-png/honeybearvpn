// config-parser.js - Universal parser supporting:
// 1. Xray/V2Ray full JSON config arrays (HoneyBear sub format)
// 2. Base64 subscriptions
// 3. Raw VLESS, VMess, Trojan, Shadowsocks, Hysteria URIs
// 4. Clash YAML proxies

const crypto = require('crypto');

function md5(str) {
  return crypto.createHash('md5').update(str).digest('hex');
}

function decodeBase64Safe(str) {
  let clean = str.trim().replace(/-/g, '+').replace(/_/g, '/');
  while (clean.length % 4 !== 0) {
    clean += '=';
  }
  return Buffer.from(clean, 'base64').toString('utf-8');
}

function parseVlessUri(rawUri) {
  try {
    const parsed = new URL(rawUri);
    const uuid = parsed.username;
    const server = parsed.hostname;
    const server_port = parseInt(parsed.port, 10) || 443;
    const name = decodeURIComponent(parsed.hash.replace(/^#/, '')) || `${server}:${server_port}`;
    const params = Object.fromEntries(parsed.searchParams.entries());

    const outbound = {
      type: 'vless',
      tag: name,
      server: server,
      server_port: server_port,
      uuid: uuid,
      packet_encoding: 'xudp'
    };

    if (params.flow) {
      outbound.flow = params.flow;
    }

    const security = (params.security || 'none').toLowerCase();
    if (security === 'reality') {
      outbound.tls = {
        enabled: true,
        server_name: params.sni || server,
        utls: { enabled: true, fingerprint: params.fp || 'chrome' },
        reality: {
          enabled: true,
          public_key: params.pbk || '',
          short_id: params.sid || ''
        }
      };
    } else if (security === 'tls') {
      outbound.tls = {
        enabled: true,
        server_name: params.sni || server,
        insecure: params.allowInsecure === '1' || params.insecure === '1',
        utls: { enabled: true, fingerprint: params.fp || 'chrome' }
      };
    }

    const netType = (params.type || 'tcp').toLowerCase();
    if (netType === 'ws') {
      outbound.transport = {
        type: 'ws',
        path: params.path || '/',
        headers: params.host ? { Host: params.host } : undefined
      };
    } else if (netType === 'grpc') {
      outbound.transport = {
        type: 'grpc',
        service_name: params.serviceName || params.service_name || ''
      };
    }

    return {
      id: md5(rawUri),
      name: name,
      protocol: 'VLESS' + (security === 'reality' ? ' Reality' : (security === 'tls' ? ' TLS' : '')),
      server: `${server}:${server_port}`,
      rawUri: rawUri,
      outbound: outbound
    };
  } catch (err) {
    return null;
  }
}

function parseVmessUri(rawUri) {
  try {
    const b64 = rawUri.replace(/^vmess:\/\//i, '');
    const jsonStr = decodeBase64Safe(b64);
    const data = JSON.parse(jsonStr);

    const name = data.ps || `${data.add}:${data.port}`;
    const outbound = {
      type: 'vmess',
      tag: name,
      server: data.add,
      server_port: parseInt(data.port, 10),
      uuid: data.id,
      security: 'auto',
      alter_id: parseInt(data.aid || 0, 10),
      packet_encoding: 'xudp'
    };

    if (data.tls === 'tls') {
      outbound.tls = {
        enabled: true,
        server_name: data.sni || data.host || data.add,
        utls: { enabled: true, fingerprint: 'chrome' }
      };
    }

    const net = (data.net || 'tcp').toLowerCase();
    if (net === 'ws') {
      outbound.transport = {
        type: 'ws',
        path: data.path || '/',
        headers: data.host ? { Host: data.host } : undefined
      };
    } else if (net === 'grpc') {
      outbound.transport = {
        type: 'grpc',
        service_name: data.path || ''
      };
    }

    return {
      id: md5(rawUri),
      name: name,
      protocol: 'VMess',
      server: `${data.add}:${data.port}`,
      rawUri: rawUri,
      outbound: outbound
    };
  } catch (err) {
    return null;
  }
}

function parseTrojanUri(rawUri) {
  try {
    const parsed = new URL(rawUri);
    const password = decodeURIComponent(parsed.username);
    const server = parsed.hostname;
    const server_port = parseInt(parsed.port, 10) || 443;
    const name = decodeURIComponent(parsed.hash.replace(/^#/, '')) || `${server}:${server_port}`;
    const params = Object.fromEntries(parsed.searchParams.entries());

    const outbound = {
      type: 'trojan',
      tag: name,
      server: server,
      server_port: server_port,
      password: password,
      tls: {
        enabled: true,
        server_name: params.sni || server,
        insecure: params.allowInsecure === '1'
      }
    };

    return {
      id: md5(rawUri),
      name: name,
      protocol: 'Trojan',
      server: `${server}:${server_port}`,
      rawUri: rawUri,
      outbound: outbound
    };
  } catch (err) {
    return null;
  }
}

function parseShadowsocksUri(rawUri) {
  try {
    const clean = rawUri.replace(/^ss:\/\//i, '');
    const hashSplit = clean.split('#');
    const mainPart = hashSplit[0];
    const name = hashSplit[1] ? decodeURIComponent(hashSplit[1]) : 'Shadowsocks';

    let method, password, server, port;

    if (mainPart.includes('@')) {
      const [userinfo, serverinfo] = mainPart.split('@');
      const [s, p] = serverinfo.split(':');
      server = s;
      port = parseInt(p, 10);

      let decodedUser = userinfo;
      try {
        const decoded = decodeBase64Safe(userinfo);
        if (decoded.includes(':')) decodedUser = decoded;
      } catch (e) {}

      const parts = decodedUser.split(':');
      method = parts[0];
      password = parts.slice(1).join(':');
    } else {
      const decoded = decodeBase64Safe(mainPart);
      const [userinfo, serverinfo] = decoded.split('@');
      const [s, p] = serverinfo.split(':');
      server = s;
      port = parseInt(p, 10);
      const parts = userinfo.split(':');
      method = parts[0];
      password = parts.slice(1).join(':');
    }

    const outbound = {
      type: 'shadowsocks',
      tag: name,
      server: server,
      server_port: port,
      method: method,
      password: password
    };

    return {
      id: md5(rawUri),
      name: name,
      protocol: 'Shadowsocks',
      server: `${server}:${port}`,
      rawUri: rawUri,
      outbound: outbound
    };
  } catch (err) {
    return null;
  }
}

function parseHysteria2Uri(rawUri) {
  try {
    const parsed = new URL(rawUri);
    const password = decodeURIComponent(parsed.username);
    const server = parsed.hostname;
    const port = parseInt(parsed.port, 10) || 443;
    const name = decodeURIComponent(parsed.hash.replace(/^#/, '')) || `${server}:${port}`;
    const params = Object.fromEntries(parsed.searchParams.entries());

    const outbound = {
      type: 'hysteria2',
      tag: name,
      server: server,
      server_port: port,
      password: password,
      tls: {
        enabled: true,
        server_name: params.sni || server,
        insecure: params.insecure === '1' || params.allowInsecure === '1'
      }
    };

    if (params.obfs && params.obfs !== 'none') {
      outbound.obfs = {
        type: params.obfs,
        password: params['obfs-password'] || ''
      };
    }

    return {
      id: md5(rawUri),
      name: name,
      protocol: 'Hysteria 2',
      server: `${server}:${port}`,
      rawUri: rawUri,
      outbound: outbound
    };
  } catch (err) {
    return null;
  }
}

function parseSingleLink(link) {
  if (!link || typeof link !== 'string') return null;
  const trimmed = link.trim();
  if (trimmed.startsWith('hysteria2://') || trimmed.startsWith('hy2://') || trimmed.startsWith('hysteria://')) {
    return parseHysteria2Uri(trimmed);
  }
  if (trimmed.startsWith('vless://')) return parseVlessUri(trimmed);
  if (trimmed.startsWith('vmess://')) return parseVmessUri(trimmed);
  if (trimmed.startsWith('trojan://')) return parseTrojanUri(trimmed);
  if (trimmed.startsWith('ss://')) return parseShadowsocksUri(trimmed);
  return null;
}

// Convert Xray JSON Array items into sing-box nodes
function parseXrayJsonArray(jsonArray, sourceUrl = null) {
  const nodes = [];
  for (let i = 0; i < jsonArray.length; i++) {
    const item = jsonArray[i];
    const ob = item.outbounds?.find(o => o.tag === 'proxy') || item.outbounds?.[0];
    if (!ob) continue;

    const name = (item.remarks || ob.tag || `Node ${i + 1}`).trim();
    const proto = (ob.protocol || '').toLowerCase();

    if (proto === 'vless') {
      const vnext = ob.settings?.vnext?.[0];
      if (!vnext) continue;
      const server = vnext.address;
      const port = vnext.port || 443;
      const uuid = vnext.users?.[0]?.id;
      const flow = vnext.users?.[0]?.flow;

      const stream = ob.streamSettings || {};
      const sec = (stream.security || 'none').toLowerCase();
      const net = (stream.network || 'tcp').toLowerCase();

      const outbound = {
        type: 'vless',
        tag: name,
        server: server,
        server_port: port,
        uuid: uuid,
        packet_encoding: 'xudp'
      };
      if (flow) outbound.flow = flow;

      if (sec === 'reality') {
        const rs = stream.realitySettings || {};
        outbound.tls = {
          enabled: true,
          server_name: rs.serverName || rs.sni || server,
          utls: { enabled: true, fingerprint: rs.fingerprint || 'chrome' },
          reality: { enabled: true, public_key: rs.publicKey || '', short_id: rs.shortId || '' }
        };
      } else if (sec === 'tls') {
        const ts = stream.tlsSettings || {};
        outbound.tls = {
          enabled: true,
          server_name: ts.serverName || ts.sni || server,
          utls: { enabled: true, fingerprint: ts.fingerprint || 'chrome' }
        };
      }

      if (net === 'ws') {
        const ws = stream.wsSettings || {};
        outbound.transport = {
          type: 'ws',
          path: ws.path || '/',
          headers: ws.headers || (ws.host ? { Host: ws.host } : undefined)
        };
      } else if (net === 'grpc') {
        const grpc = stream.grpcSettings || {};
        outbound.transport = {
          type: 'grpc',
          service_name: grpc.serviceName || ''
        };
      } else if (net === 'xhttp' || net === 'splithttp') {
        const xhttp = stream.xhttpSettings || stream.splithttpSettings || {};
        outbound.transport = {
          type: 'http',
          host: xhttp.host ? [xhttp.host] : undefined,
          path: xhttp.path || '/'
        };
      }

      nodes.push({
        id: md5(name + server + port + i),
        name: name,
        protocol: 'VLESS' + (sec === 'reality' ? ' Reality' : (net === 'ws' ? ' WS' : (net === 'grpc' ? ' gRPC' : (net === 'xhttp' ? ' LTE' : '')))),
        server: `${server}:${port}`,
        subscriptionUrl: sourceUrl,
        outbound: outbound
      });
    } else if (proto === 'hysteria' || proto === 'hysteria2') {
      const server = ob.settings?.address;
      const port = ob.settings?.port || 443;
      const auth = ob.streamSettings?.hysteriaSettings?.auth || '';
      const tls = ob.streamSettings?.tlsSettings || {};

      const outbound = {
        type: 'hysteria2',
        tag: name,
        server: server,
        server_port: port,
        password: auth,
        tls: {
          enabled: true,
          server_name: tls.serverName || server
        }
      };

      nodes.push({
        id: md5(name + server + port + i),
        name: name,
        protocol: 'Hysteria 2',
        server: `${server}:${port}`,
        subscriptionUrl: sourceUrl,
        outbound: outbound
      });
    }
  }

  return nodes;
}

// Retrieve persistent or machine HWID for Remnawave/Happ compatibility
function getMachineHWID() {
  const os = require('os');
  const crypto = require('crypto');

  try {
    const seed = os.hostname() + '-' + os.platform() + '-' + os.arch() + '-' + (os.cpus()?.length || 4);
    return crypto.createHash('sha256').update(seed).digest('hex').slice(0, 16);
  } catch (e) {
    return crypto.randomBytes(8).toString('hex');
  }
}

// Fetch subscription with auto-retries on 502/network glitches
// Supports Remnawave HWID verification via Happ headers and fallbacks
async function fetchSubscriptionContent(urlStr) {
  const os = require('os');
  const hwid = getMachineHWID();
  const osVer = os.release() || '10.0.26100';

  const clientConfigs = [
    // 1. Happ with HWID (required for Remnawave when HWID limit is ON)
    {
      'User-Agent': 'Happ/2.8.0/Windows',
      'X-Device-OS': 'Windows',
      'X-Ver-OS': osVer,
      'X-Device-model': 'PC',
      'X-Device-Locale': 'ru_RU',
      'X-HWID': hwid,
      'Accept': 'application/json, text/plain, */*'
    },
    // 2. Standard v2rayN fallback
    {
      'User-Agent': 'v2rayN/6.45',
      'Accept': 'application/json, text/plain, */*'
    },
    // 3. sing-box fallback
    {
      'User-Agent': 'sing-box/1.10.0',
      'Accept': 'application/json, text/plain, */*'
    }
  ];

  let lastError = null;

  for (let attempt = 0; attempt < 3; attempt++) {
    for (const headers of clientConfigs) {
      try {
        const controller = new AbortController();
        const timer = setTimeout(() => controller.abort(), 12000);

        const response = await fetch(urlStr, {
          headers: {
            ...headers,
            'Accept-Encoding': 'gzip, deflate, br'
          },
          signal: controller.signal
        });

        clearTimeout(timer);

        if (response.ok) {
          const text = await response.text();
          if (text && text.trim().length > 0) {
            // Check if server rejected client with dummy "App not supported"
            if (text.includes('App%20not%20supported') || text.includes('App not supported')) {
              lastError = new Error('Сервер подписки отклонил подключение. Возможно, у вас превышен лимит устройств в панели управления.');
              continue;
            }
            const meta = parseSubscriptionMeta(response.headers);
            return { text, meta };
          }
        } else if (response.status === 502 || response.status === 503) {
          lastError = new Error(`Сервер вернул ${response.status} (шлюз перегружен, повторите через пару секунд)`);
        } else {
          lastError = new Error(`HTTP ${response.status}: ${response.statusText}`);
        }
      } catch (err) {
        lastError = err;
      }
    }
    await new Promise(r => setTimeout(r, 800));
  }

  throw lastError || new Error('Не удалось получить данные подписки. Возможно, у вас превышен лимит устройств в панели управления.');
}

// Parse subscription-userinfo header: "upload=...; download=...; total=...; expire=..."
function parseSubscriptionMeta(headers) {
  try {
    const raw = headers.get('subscription-userinfo') || headers.get('Subscription-Userinfo') || '';
    if (!raw) return null;
    const obj = {};
    raw.split(';').forEach(part => {
      const [k, v] = part.trim().split('=');
      if (k && v !== undefined) obj[k.trim()] = v.trim();
    });

    const meta = {};
    if (obj.upload) meta.upload = parseInt(obj.upload, 10);
    if (obj.download) meta.download = parseInt(obj.download, 10);
    if (obj.total) meta.total = parseInt(obj.total, 10);
    if (obj.expire) {
      const ts = parseInt(obj.expire, 10);
      meta.expire = ts;
      meta.expireDate = new Date(ts * 1000).toLocaleDateString('ru-RU', {
        day: '2-digit', month: '2-digit', year: 'numeric'
      });
      meta.daysLeft = Math.ceil((ts * 1000 - Date.now()) / 86400000);
    }

    return Object.keys(meta).length > 0 ? meta : null;
  } catch (e) {
    return null;
  }
}

function extractNodesFromContent(content, sourceUrl = null) {
  const trimmed = content.trim();
  let servers = [];

  // Try 1: Parse as JSON (Xray Array or Sing-Box object)
  try {
    const json = JSON.parse(trimmed);
    if (Array.isArray(json)) {
      const xrayNodes = parseXrayJsonArray(json, sourceUrl);
      if (xrayNodes.length > 0) servers = xrayNodes;
    }
  } catch (e) {}

  // Try 2: Base64 decode
  if (servers.length === 0) {
    let candidateText = trimmed;
    try {
      const decoded = decodeBase64Safe(trimmed);
      if (decoded) {
        // Check if decoded text is JSON
        try {
          const decodedJson = JSON.parse(decoded);
          if (Array.isArray(decodedJson)) {
            const xrayNodes = parseXrayJsonArray(decodedJson, sourceUrl);
            if (xrayNodes.length > 0) servers = xrayNodes;
          }
        } catch (e) {}

        if (servers.length === 0 && (decoded.includes('://') || decoded.includes('proxies:'))) {
          candidateText = decoded;
        }
      }
    } catch (e) {}

    // Try 3: Line by line
    if (servers.length === 0) {
      const lines = candidateText.split(/[\r\n]+/).map(l => l.trim()).filter(Boolean);
      for (const line of lines) {
        let s = parseSingleLink(line);
        if (!s) {
          try {
            const lineDecoded = decodeBase64Safe(line);
            s = parseSingleLink(lineDecoded);
          } catch (e) {}
        }

        if (s) {
          if (sourceUrl) s.subscriptionUrl = sourceUrl;
          servers.push(s);
        }
      }
    }

    // Try 4: Regex match for links (supporting hysteria2, hy2, vless, vmess, trojan, ss)
    if (servers.length === 0) {
      const regex = /(?:hysteria2|hy2|hysteria|vless|vmess|trojan|ss):\/\/[^\s"'<>]+/gi;
      const matches = candidateText.match(regex);
      if (matches) {
        for (const m of matches) {
          const s = parseSingleLink(m);
          if (s) {
            if (sourceUrl) s.subscriptionUrl = sourceUrl;
            servers.push(s);
          }
        }
      }
    }
  }

  // Filter out dummy/error nodes (e.g. Remnawave "App not supported" dummy node)
  servers = servers.filter(n => {
    const isAppNotSupported = (n.name || '').toLowerCase().includes('app not supported') ||
                             (n.server || '').includes('0.0.0.0:1');
    return !isAppNotSupported;
  });

  // User requirement: take ONLY Hysteria / Hysteria 2 servers (gaming nodes)
  const hysteriaServers = servers.filter(n => (n.protocol || '').toLowerCase().includes('hysteria'));
  if (hysteriaServers.length > 0) {
    return hysteriaServers;
  }

  return servers;
}

async function parseInput(input) {
  if (!input || typeof input !== 'string') {
    throw new Error('Пустой ввод');
  }

  const trimmed = input.trim();

  // If HTTP / HTTPS subscription URL
  if (/^https?:\/\//i.test(trimmed)) {
    console.log(`[ConfigParser] Загрузка подписки: ${trimmed}`);
    const { text: rawContent, meta } = await fetchSubscriptionContent(trimmed);
    const servers = extractNodesFromContent(rawContent, trimmed);
    if (servers.length === 0) {
      throw new Error('В подписке не найдено поддерживаемых серверов (Hysteria 2). Возможно, у вас превышен лимит устройств в панели управления.');
    }
    return { type: 'subscription', url: trimmed, servers, meta: meta || null };
  }

  // Otherwise, direct links or base64
  const servers = extractNodesFromContent(trimmed);
  if (servers.length > 0) {
    return { type: 'nodes', servers: servers };
  }

  throw new Error('Не удалось распознать ссылку или ключ (поддерживаются ссылки на подписки https:// и протокол Hysteria 2). Возможно, у вас превышен лимит устройств в панели управления.');
}

const KNOWN_SERVICE_BUNDLES = {
  twitch: {
    domains: [
      'twitch.tv',
      'ttvnw.net',
      'jtvnw.net',
      'twitchcdn.net',
      'ext-twitch.tv',
      'twitchsvc.net',
      'ttv.lol'
    ],
    processes: ['Twitch.exe', 'twitch.exe']
  },
  youtube: {
    domains: [
      'youtube.com',
      'youtu.be',
      'ytimg.com',
      'googlevideo.com',
      'youtubei.googleapis.com',
      'yt3.ggpht.com',
      'yt4.ggpht.com',
      'ggpht.com',
      'gvt1.com',
      'googleapis.com'
    ],
    processes: []
  },
  discord: {
    domains: [
      'discord.com',
      'discord.gg',
      'discordapp.com',
      'discordapp.net',
      'discord.media',
      'discordstatus.com',
      'dis.gd',
      'gateway.discord.gg',
      'cdn.discordapp.com',
      'media.discordapp.net',
      'images-ext-1.discordapp.net',
      'images-ext-2.discordapp.net',
      'router.discordapp.net',
      'discord.co',
      'discord.dev',
      'discord-attachments-1.net'
    ],
    processes: ['Discord.exe', 'discord.exe', 'Update.exe', 'DiscordCanary.exe', 'DiscordPTB.exe', 'DiscordDevelopment.exe', 'DiscordHelper.exe']
  },
  telegram: {
    domains: [
      'telegram.org',
      't.me',
      'telegram.me',
      'tx.me',
      'telesco.pe',
      'tg.dev',
      'telegram.dog',
      'web.telegram.org'
    ],
    processes: ['Telegram.exe', 'telegram.exe', 'TgWsProxy_windows.exe']
  },
  twitter: {
    domains: ['twitter.com', 'x.com', 'twimg.com', 't.co', 'abs.twimg.com', 'pbs.twimg.com'],
    processes: []
  },
  instagram: {
    domains: ['instagram.com', 'cdninstagram.com', 'facebook.com', 'fbcdn.net', 'meta.com'],
    processes: []
  },
  chatgpt: {
    domains: ['openai.com', 'chatgpt.com', 'oaistatic.com', 'oaiusercontent.com', 'auth0.openai.com'],
    processes: []
  },
  gemini: {
    domains: [
      'gemini.google.com',
      'bard.google.com',
      'flow.google.com',
      'labs.google',
      'aisandbox-pa.googleapis.com',
      'aisandbox-pa-webchannel.clients6.google.com',
      'aitestkitchen.withgoogle.com',
      'notebooklm.google',
      'notebooklm.google.com',
      'aistudio.google.com',
      'generativelanguage.googleapis.com',
      'proactivebackend-pa.googleapis.com',
      'alkalimakersuite-pa.clients6.google.com',
      'waa-pa.clients6.google.com',
      'geminiweb-pa.clients6.google.com',
      'gemini.app.google',
      'ai.google.dev',
      'deepmind.google'
    ],
    processes: []
  },
  spotify: {
    domains: ['spotify.com', 'scdn.co', 'spotifycdn.com', 'audio-fa.scdn.co'],
    processes: ['Spotify.exe', 'spotify.exe']
  },
  tiktok: {
    domains: ['tiktok.com', 'tiktokv.com', 'tiktokcdn.com', 'byteoversea.com', 'ibytedtos.com'],
    processes: []
  },
  steam: {
    domains: ['steampowered.com', 'steamcommunity.com', 'steamstatic.com', 'steamcontent.com'],
    processes: ['steam.exe', 'Steam.exe', 'steamwebhelper.exe']
  },
  roblox: {
    domains: ['roblox.com', 'rbxcdn.com', 'robloxlabs.com'],
    processes: ['RobloxPlayerBeta.exe', 'RobloxStudioBeta.exe']
  },
  rutracker: {
    domains: ['rutracker.org', 'rutracker.net', 'rutracker.cc', 'rutracker.nl'],
    processes: []
  },
  reddit: {
    domains: ['reddit.com', 'redd.it', 'redditmedia.com', 'redditstatic.com'],
    processes: []
  },
  notion: {
    domains: ['notion.so', 'notion.site', 'notion.com'],
    processes: []
  },
  pinterest: {
    domains: ['pinterest.com', 'pinimg.com'],
    processes: []
  },
  github: {
    domains: ['github.com', 'githubusercontent.com', 'github.io', 'githubassets.com'],
    processes: []
  }
};

const SERVICE_ALIASES = {
  'твич': 'twitch',
  'твитч': 'twitch',
  'твитч тв': 'twitch',
  'твич тв': 'twitch',
  'twitch': 'twitch',
  'twitch tv': 'twitch',
  'twitch.tv': 'twitch',
  'ttv': 'twitch',
  'ютуб': 'youtube',
  'ютубчик': 'youtube',
  'youtube': 'youtube',
  'youtube.com': 'youtube',
  'дискорд': 'discord',
  'диск': 'discord',
  'дс': 'discord',
  'discord': 'discord',
  'discord.com': 'discord',
  'телеграм': 'telegram',
  'телега': 'telegram',
  'тг': 'telegram',
  'telegram': 'telegram',
  't.me': 'telegram',
  'telegram.org': 'telegram',
  'твиттер': 'twitter',
  'твитер': 'twitter',
  'twitter': 'twitter',
  'x': 'twitter',
  'x.com': 'twitter',
  'инста': 'instagram',
  'инстаграм': 'instagram',
  'инстаграмм': 'instagram',
  'instagram': 'instagram',
  'instagram.com': 'instagram',
  'чатгпт': 'chatgpt',
  'гпт': 'chatgpt',
  'openai': 'chatgpt',
  'chatgpt': 'chatgpt',
  'chatgpt.com': 'chatgpt',
  'gemini': 'gemini',
  'гемини': 'gemini',
  'джемини': 'gemini',
  'bard': 'gemini',
  'бард': 'gemini',
  'gemini.google.com': 'gemini',
  'flow': 'gemini',
  'флоу': 'gemini',
  'гугл флоу': 'gemini',
  'гугл flow': 'gemini',
  'google flow': 'gemini',
  'flow.google.com': 'gemini',
  'labs.google': 'gemini',
  'спотифай': 'spotify',
  'споти': 'spotify',
  'spotify': 'spotify',
  'spotify.com': 'spotify',
  'тикток': 'tiktok',
  'тик ток': 'tiktok',
  'tiktok': 'tiktok',
  'tiktok.com': 'tiktok',
  'стим': 'steam',
  'steam': 'steam',
  'роблокс': 'roblox',
  'roblox': 'roblox',
  'roblox.com': 'roblox',
  'рутрекер': 'rutracker',
  'rutracker': 'rutracker',
  'rutracker.org': 'rutracker',
  'реддит': 'reddit',
  'reddit': 'reddit',
  'reddit.com': 'reddit',
  'ноушен': 'notion',
  'нотион': 'notion',
  'notion': 'notion',
  'notion.so': 'notion',
  'пинтерест': 'pinterest',
  'pinterest': 'pinterest',
  'pinterest.com': 'pinterest',
  'гитхаб': 'github',
  'github': 'github',
  'github.com': 'github'
};

function expandCustomItems(customItems) {
  const domains = new Set();
  const domainKeywords = new Set();
  const processes = new Set();

  for (const raw of customItems) {
    if (!raw || typeof raw !== 'string') continue;
    const clean = raw.trim().toLowerCase();
    if (!clean) continue;

    // Check alias
    const aliasKey = SERVICE_ALIASES[clean] || (SERVICE_ALIASES[clean.replace(/[\s\-_]+/g, ' ')]);
    if (aliasKey && KNOWN_SERVICE_BUNDLES[aliasKey]) {
      const bundle = KNOWN_SERVICE_BUNDLES[aliasKey];
      bundle.domains.forEach(d => domains.add(d));
      bundle.processes.forEach(p => processes.add(p));
      continue;
    }

    // Check if clean matches known bundle domain directly
    let matchedBundle = false;
    for (const [key, bundle] of Object.entries(KNOWN_SERVICE_BUNDLES)) {
      if (bundle.domains.some(d => clean.includes(d) || d.includes(clean))) {
        bundle.domains.forEach(d => domains.add(d));
        bundle.processes.forEach(p => processes.add(p));
        matchedBundle = true;
        break;
      }
    }
    if (matchedBundle) continue;

    // Check .exe
    if (clean.endsWith('.exe')) {
      processes.add(raw.trim());
      processes.add(clean);
      continue;
    }

    // Clean URL to domain
    let host = clean
      .replace(/^(https?:\/\/)?(www\.)?/, '')
      .split('/')[0]
      .split('?')[0]
      .split('#')[0]
      .split(':')[0]
      .replace(/^\*\./, '')
      .replace(/^\./, '')
      .trim();

    if (host.includes('.')) {
      domains.add(host);
    } else if (host.length > 0) {
      domainKeywords.add(host);
    }
  }

  return {
    domains: Array.from(domains),
    domainKeywords: Array.from(domainKeywords),
    processes: Array.from(processes)
  };
}

const AD_DOMAINS = [
  // Yandex Advertising, Direct & Metrika
  'an.yandex.ru',
  'mc.yandex.ru',
  'yabs.yandex.ru',
  'adfox.ru',
  'direct.yandex.ru',
  'metrika.yandex.ru',
  'ads.yandex.ru',
  'banners.yandex.ru',
  'awaps.yandex.ru',
  'bs.yandex.ru',
  'clck.yandex.ru',
  // Google Ads, DoubleClick, AdSense
  'doubleclick.net',
  'googleadservices.com',
  'googlesyndication.com',
  'ads.google.com',
  'adservice.google.com',
  'pagead2.googlesyndication.com',
  'analytics.google.com',
  'google-analytics.com',
  'stats.g.doubleclick.net',
  // Popular Global & Russian Ad / Tracker Networks
  'taboola.com',
  'outbrain.com',
  'criteo.com',
  'criteo.net',
  'adroll.com',
  'popads.net',
  'propellerads.com',
  'adnxs.com',
  'advertising.com',
  'rubiconproject.com',
  'pubmatic.com',
  'openx.net',
  'smartadserver.com',
  'mgid.com',
  'adriver.ru',
  'admitad.com',
  'admixer.net',
  'begun.ru',
  'tns-counter.ru',
  'top-fwz1.mail.ru'
];

const AD_KEYWORDS = [
  'adservice',
  'adserver',
  'pagead',
  'adnxs'
];

function generateSingBoxConfig(selectedOutbound, options = {}) {
  const comssDnsEnabled = options.comssDns !== false;
  const mixedPort = options.mixedPort || 20808;
  const routing = options.routing || {
    mode: 'whitelist',
    apps: {
      discord: true,
      telegram: false,
      youtube: false,
      browsers: false
    },
    custom: []
  };

  const allNodes = options.allNodes || [];
  // Detect a verified European node (Germany, Netherlands, Sweden, etc.) for Google AI / Gemini routing
  let aiNode = null;
  if (Array.isArray(allNodes) && allNodes.length > 0) {
    aiNode = allNodes.find(n => n.name && (n.name.includes('Германия') || n.name.includes('German') || (n.server && n.server.includes('german'))));
    if (!aiNode) {
      aiNode = allNodes.find(n => n.name && (n.name.includes('Нидерланды') || n.name.includes('netherlands') || n.name.includes('Швеция') || n.name.includes('sweden') || n.name.includes('США') || n.name.includes('usa')));
    }
  }

  const isProxyAlreadyAi = aiNode && aiNode.outbound && selectedOutbound && (
    aiNode.outbound.server === selectedOutbound.server ||
    (selectedOutbound.server && selectedOutbound.server.includes('german'))
  );

  const hasDedicatedAiOutbound = aiNode && aiNode.outbound && !isProxyAlreadyAi;
  const effectiveAiOutboundTag = hasDedicatedAiOutbound ? 'proxy-ai' : 'proxy';

  const geminiDomains = [
    // 1. Google Gemini & Bard
    'gemini.google.com',
    'bard.google.com',
    'gemini.app.google',
    'ai.google.dev',
    'deepmind.google',
    'proactivebackend-pa.googleapis.com',
    'waa-pa.clients6.google.com',
    'geminiweb-pa.clients6.google.com',

    // 2. Google Flow & Google Labs AI Sandbox
    'flow.google.com',
    'labs.google',
    'aitestkitchen.withgoogle.com',
    'withgoogle.com',
    'aisandbox-pa.googleapis.com',
    'enterprise-aisandbox-pa.googleapis.com',
    'aisandbox-pa-webchannel.clients6.google.com',
    'flowmusic.app',

    // 3. Google AI Studio & NotebookLM
    'aistudio.google.com',
    'notebooklm.google',
    'notebooklm.google.com',
    'generativelanguage.googleapis.com',
    'alkalimakersuite-pa.clients6.google.com',

    // 4. Google Auth, Session & WebChannel Infrastructure (CRITICAL)
    // Ensures accounts.google.com, clients6.google.com and related session endpoints
    // share the exact same clean German IP as Flow and Gemini, preventing IP mismatch and region blocks
    'accounts.google.com',
    'accounts.youtube.com',
    'myaccount.google.com',
    'apis.google.com',
    'clients6.google.com',
    'signaler-pa.clients6.google.com',
    'ogads-pa.clients6.google.com',
    'play.google.com',
    'googleusercontent.com'
  ];

  const mode = routing.mode || 'whitelist';
  const apps = routing.apps || {};
  const custom = routing.custom || [];

  const targetDomains = [];
  const targetDomainKeywords = [];
  const targetProcesses = [];

  // Discord preset
  if (apps.discord) {
    targetDomains.push(...KNOWN_SERVICE_BUNDLES.discord.domains);
    targetProcesses.push(...KNOWN_SERVICE_BUNDLES.discord.processes);
  }

  // Discord dedicated IP ranges (Voice & RTC media servers)
  // Note: Generic Cloudflare/Google Cloud CDN ranges (104.16.0.0/12, 172.64.0.0/13, etc.) are excluded here
  // so regular websites (2ip.ru, whoer.net, etc.) are NOT proxied when only Discord is selected.
  const discordIpRanges = [
    '194.221.248.0/21', // i3D.net (Discord Europe voice/media servers, Rotterdam/Frankfurt)
    '66.22.196.0/22',   // Discord Inc
    '66.22.200.0/21',   // Discord Inc
    '66.22.208.0/20',   // Discord Inc
    '66.22.224.0/19',   // Discord Inc
    '66.22.240.0/20',   // Discord Inc
    '138.128.136.0/21'  // Discord Inc
  ];

  // Telegram preset
  const telegramIpRanges = [
    '91.108.56.0/22',
    '91.108.4.0/22',
    '91.108.8.0/22',
    '91.108.16.0/22',
    '91.108.12.0/22',
    '149.154.160.0/20',
    '149.154.164.0/22',
    '149.154.168.0/22',
    '149.154.172.0/22'
  ];

  if (apps.telegram) {
    targetDomains.push(...KNOWN_SERVICE_BUNDLES.telegram.domains);
    targetProcesses.push(...KNOWN_SERVICE_BUNDLES.telegram.processes);
  }

  // YouTube & Google preset
  if (apps.youtube) {
    targetDomains.push(...KNOWN_SERVICE_BUNDLES.youtube.domains);
  }

  // Web Browsers preset
  if (apps.browsers) {
    targetProcesses.push('chrome.exe', 'msedge.exe', 'firefox.exe', 'browser.exe', 'opera.exe', 'brave.exe');
  }

  // Smart Custom apps and domains expansion
  if (Array.isArray(custom) && custom.length > 0) {
    const expanded = expandCustomItems(custom);
    targetDomains.push(...expanded.domains);
    targetDomainKeywords.push(...expanded.domainKeywords);
    targetProcesses.push(...expanded.processes);
  }

  const rules = [
    {
      action: 'sniff'
    },
    {
      protocol: 'dns',
      action: 'hijack-dns'
    },
    {
      ip_is_private: true,
      outbound: 'direct'
    }
  ];

  // 1. Google Gemini & AI route:
  // Guarantees Gemini works on ALL servers (Finland, Sweden, Russia, etc.) and in Split Tunneling by routing through verified Germany/EU node!
  rules.push({
    domain_suffix: geminiDomains,
    outbound: effectiveAiOutboundTag
  });

  // 2. Block QUIC (UDP 443) for AI and Google domains so browsers immediately fall back to TCP HTTPS.
  // Crucial for dual-outbound SNI sniffing to reliably route to proxy-ai.
  rules.push({
    network: 'udp',
    port: [443],
    domain_suffix: [
      'google.com',
      'googleapis.com',
      'gstatic.com',
      'googleusercontent.com',
      'chatgpt.com',
      'openai.com',
      'claude.ai',
      'anthropic.com'
    ],
    outbound: 'block'
  });

  // 3. Block WebRTC STUN leaks (UDP 19302, 19305, 3478, 5349) to Google STUN servers.
  // Prevents Google Gemini / Google Flow from detecting the user's real Russian ISP IP via WebRTC.
  rules.push({
    network: 'udp',
    port: [19302, 19305, 3478, 5349],
    domain_suffix: ['google.com', 'l.google.com'],
    outbound: 'block'
  });

  if (comssDnsEnabled) {
    // 4. DNS-AI and Comss.one Smart DNS infrastructure & SNI reverse proxy IP pools MUST ALWAYS go direct!
    // SNI reverse proxy servers require clean direct handshake from client without double-tunneling.
    rules.push({
      domain_suffix: [
        'dns-ai.ru',
        'comss.one',
        'comss.ru'
      ],
      outbound: 'direct'
    });
    rules.push({
      ip_cidr: [
        '94.250.253.0/24',
        '83.220.169.0/24',
        '194.87.196.0/24',
        '45.151.102.0/24',
        '212.109.195.0/24',
        '195.133.25.0/24',
        '199.189.249.0/24', // Gemini reverse proxy pool (199.189.249.126)
        '80.74.30.0/24',    // Comss AI / ChatGPT reverse proxy pool (80.74.30.162)
        '132.243.113.0/24', // Comss AI reverse proxy pool (132.243.113.26)
        '62.60.230.0/24'    // DNS-AI reverse proxy pool (62.60.230.61)
      ],
      outbound: 'direct'
    });
  }

  // Built-in AdBlock (blocks advertising, trackers, and popup networks)
  if (routing.adblock !== false) {
    rules.push({
      domain_suffix: AD_DOMAINS,
      domain_keyword: AD_KEYWORDS,
      outbound: 'block'
    });
  }

  if (mode === 'whitelist') {
    // Mode: ONLY selected items go to proxy, everything else direct!
    if (targetDomains.length > 0) {
      rules.push({
        domain_suffix: targetDomains,
        outbound: 'proxy'
      });
    }
    if (targetDomainKeywords.length > 0) {
      rules.push({
        domain_keyword: targetDomainKeywords,
        outbound: 'proxy'
      });
    }
    if (targetProcesses.length > 0) {
      rules.push({
        process_name: targetProcesses,
        outbound: 'proxy'
      });
    }
    if (apps.discord) {
      rules.push({
        ip_cidr: discordIpRanges,
        outbound: 'proxy'
      });
      // Discord WebRTC Voice UDP ports (50000-65535) and STUN (3478, 5349)
      rules.push({
        network: 'udp',
        port_range: ['50000:65535'],
        outbound: 'proxy'
      });
      rules.push({
        network: 'udp',
        port: [3478, 5349],
        outbound: 'proxy'
      });
    }
    if (apps.telegram) {
      rules.push({
        ip_cidr: telegramIpRanges,
        outbound: 'proxy'
      });
    }
    // Default fallback: direct!
    rules.push({
      outbound: 'direct'
    });
  } else if (mode === 'blacklist') {
    // Mode: ALL except selected go to proxy (selected go direct!)
    if (targetDomains.length > 0) {
      rules.push({
        domain_suffix: targetDomains,
        outbound: 'direct'
      });
    }
    if (targetDomainKeywords.length > 0) {
      rules.push({
        domain_keyword: targetDomainKeywords,
        outbound: 'direct'
      });
    }
    if (targetProcesses.length > 0) {
      rules.push({
        process_name: targetProcesses,
        outbound: 'direct'
      });
    }
    // Default fallback: proxy!
    rules.push({
      outbound: 'proxy'
    });
  } else {
    // Mode: ALL traffic goes to proxy
    rules.push({
      outbound: 'proxy'
    });
  }

  const inbounds = [
    {
      type: 'mixed',
      tag: 'mixed-in',
      listen: '127.0.0.1',
      listen_port: mixedPort
    }
  ];

  if (options.tunMode !== false) {
    inbounds.unshift({
      type: 'tun',
      tag: 'tun-in',
      address: ['172.19.0.1/30'],
      auto_route: true,
      strict_route: false,
      stack: 'mixed',
      mtu: 1400
    });
  }

  const proxyOutbound = {
    ...selectedOutbound,
    tag: 'proxy'
  };
  // Only apply port hopping if multiple ports / hopping range is explicitly configured
  if (proxyOutbound.type === 'hysteria2' && (proxyOutbound.server_ports || (typeof proxyOutbound.server_port === 'string' && proxyOutbound.server_port.includes(':')))) {
    proxyOutbound.hop_interval = '15s';
  }

  const dnsServers = comssDnsEnabled
    ? [
        {
          tag: 'dns-ai',
          type: 'https',
          server: '194.87.196.13',
          server_port: 443,
          tls: {
            enabled: true,
            server_name: 'dns.dns-ai.ru'
          }
        },
        {
          tag: 'dns-ai-backup',
          type: 'https',
          server: '45.151.102.219',
          server_port: 443,
          tls: {
            enabled: true,
            server_name: 'dns.dns-ai.ru'
          }
        },
        {
          tag: 'dns-comss',
          type: 'https',
          server: '94.250.253.55',
          server_port: 443,
          tls: {
            enabled: true,
            server_name: 'dns.comss.one'
          }
        },
        {
          tag: 'dns-comss-backup',
          type: 'https',
          server: '83.220.169.155',
          server_port: 443,
          tls: {
            enabled: true,
            server_name: 'dns.comss.one'
          }
        },
        {
          tag: 'dns-remote',
          type: 'tcp',
          server: '1.1.1.1',
          server_port: 53,
          detour: 'proxy'
        },
        {
          tag: 'dns-remote-ai',
          type: 'tcp',
          server: '1.1.1.1',
          server_port: 53,
          detour: effectiveAiOutboundTag
        },
        {
          tag: 'dns-local',
          type: 'local'
        }
      ]
    : [
        {
          tag: 'dns-remote',
          type: 'tcp',
          server: '1.1.1.1',
          server_port: 53,
          detour: 'proxy'
        },
        {
          tag: 'dns-remote-ai',
          type: 'tcp',
          server: '1.1.1.1',
          server_port: 53,
          detour: effectiveAiOutboundTag
        },
        {
          tag: 'dns-google',
          type: 'tcp',
          server: '8.8.8.8',
          server_port: 53,
          detour: 'proxy'
        },
        {
          tag: 'dns-local',
          type: 'local'
        }
      ];

  const primaryResolverTag = comssDnsEnabled ? 'dns-ai' : (mode === 'whitelist' ? 'dns-local' : 'dns-remote');
  const targetDomainResolver = comssDnsEnabled ? 'dns-ai' : 'dns-remote';

  const dnsRules = [];
  // Resolve Gemini through the German / AI outbound so Google gets clean European DNS records
  dnsRules.push({
    domain_suffix: geminiDomains,
    server: 'dns-remote-ai'
  });

  if (comssDnsEnabled) {
    dnsRules.push({
      domain_suffix: [
        'dns-ai.ru',
        'comss.one',
        'comss.ru',
        'chatgpt.com',
        'openai.com',
        'oaistatic.com',
        'oaiusercontent.com',
        'claude.ai',
        'anthropic.com',
        'canva.com',
        'notion.so',
        'spotify.com'
      ],
      server: 'dns-ai'
    });
  }

  if (mode === 'whitelist') {
    if (targetDomains.length > 0) {
      dnsRules.push({ domain_suffix: targetDomains, server: targetDomainResolver });
    }
    if (targetDomainKeywords.length > 0) {
      dnsRules.push({ domain_keyword: targetDomainKeywords, server: targetDomainResolver });
    }
    if (targetProcesses.length > 0) {
      dnsRules.push({ process_name: targetProcesses, server: targetDomainResolver });
    }
  }

  const outbounds = [proxyOutbound];
  if (hasDedicatedAiOutbound) {
    outbounds.push({
      ...aiNode.outbound,
      tag: 'proxy-ai'
    });
  }
  outbounds.push(
    {
      type: 'direct',
      tag: 'direct'
    },
    {
      type: 'block',
      tag: 'block'
    }
  );

  return {
    experimental: {
      clash_api: {
        external_controller: '127.0.0.1:9095'
      }
    },
    log: {
      level: 'info',
      timestamp: true
    },
    dns: {
      servers: dnsServers,
      rules: dnsRules,
      final: primaryResolverTag,
      strategy: 'ipv4_only'
    },
    inbounds: inbounds,
    outbounds: outbounds,
    route: {
      default_domain_resolver: primaryResolverTag,
      find_process: true,
      rules: rules,
      auto_detect_interface: true
    }
  };
}

module.exports = {
  parseInput,
  parseSingleLink,
  extractNodesFromContent,
  generateSingBoxConfig
};
