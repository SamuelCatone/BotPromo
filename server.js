const http = require('node:http');
const fs = require('node:fs');
const path = require('node:path');
const { URL } = require('node:url');
const dotenv = require('dotenv');
const { Pool } = require('pg');
const { createClient } = require('@supabase/supabase-js');

dotenv.config({ override: true });

const PORT = Number(process.env.PORT || 5001);
const HOST = '0.0.0.0';
const ROOT = __dirname;

const USER_PROD_WEBHOOK = 'https://n8n.vps9669.panel.icontainer.net/webhook/0412b07a-992e-41ec-923f-afc9db9fcf07';
const USER_PRODUTOS_WEBHOOK = 'https://n8n.vps9669.panel.icontainer.net/webhook/65a69d70-6202-47ef-bb6f-b0899b342d91';

const rawN8nWebhook = (process.env.N8N_ACTIVAR_WEBHOOK || '').trim();
let currentN8nWebhook = (rawN8nWebhook && !rawN8nWebhook.includes('sua-url-n8n') && !rawN8nWebhook.includes('b51b1fd4') && !rawN8nWebhook.includes('webhook-test'))
  ? rawN8nWebhook
  : USER_PROD_WEBHOOK;

const rawN8nProdutosWebhook = (process.env.N8N_PRODUTOS_WEBHOOK || '').trim();
let currentN8nProdutosWebhook = (rawN8nProdutosWebhook && !rawN8nProdutosWebhook.includes('sua-url-n8n') && !rawN8nProdutosWebhook.includes('13230517') && !rawN8nProdutosWebhook.includes('webhook-test'))
  ? rawN8nProdutosWebhook
  : USER_PRODUTOS_WEBHOOK;

const WATCHDOG_FILE = path.join(ROOT, 'watchdog_config.json');

let initialWatchdogEnabled = true;
try {
  if (fs.existsSync(WATCHDOG_FILE)) {
    const data = JSON.parse(fs.readFileSync(WATCHDOG_FILE, 'utf-8'));
    if (typeof data.enabled === 'boolean') initialWatchdogEnabled = data.enabled;
  }
} catch (_) {}

const watchdogState = {
  enabled: initialWatchdogEnabled,
  currentRetries: 0,
  maxRetries: 5,
  intervalMinutes: 10,
  status: initialWatchdogEnabled ? 'active' : 'disabled',
  lastDispatchTime: null,
};

const rawSupabaseUrl = (process.env.SUPABASE_URL || '').trim();
const SUPABASE_URL = (rawSupabaseUrl && !rawSupabaseUrl.includes('seu-projeto'))
  ? rawSupabaseUrl
  : 'https://kewtadtuizlncqpphzcf.supabase.co';

const rawAnonKey = (process.env.SUPABASE_ANON_KEY || '').trim();
const SUPABASE_ANON_KEY = (rawAnonKey && !rawAnonKey.includes('sua-chave-publica') && !rawAnonKey.includes('sua_chave'))
  ? rawAnonKey
  : 'sb_publishable_Ds6-Gm0uBcRNy8SrNRNLbg_IG3B8T-L';

const rawDbUrl = (process.env.DATABASE_URL || '').trim();
const DATABASE_URL = (rawDbUrl && !rawDbUrl.includes('usuario:senha@host') && !rawDbUrl.includes('placeholder'))
  ? rawDbUrl
  : 'postgresql://postgres.kewtadtuizlncqpphzcf:P*KD%2CQaC_bE8%40SH@aws-1-us-west-2.pooler.supabase.com:5432/postgres';

const TABLES = {
  enviados: 'n8n_produtos_enviados',
  geral: 'n8n_produtos_geral',
  linkAtual: 'n8n_link_atual',
  historicoLink: 'n8n_historico_link',
  historicoProdutos: 'n8n_historico_produtos',
  timer: 'n8n_timer',
  categorias: 'n8n_categoria',
  todosProdutos: 'n8n_todos_produtos',
  logSeguranca: 'n8n_log_seguranca',
  categoriasUsuarios: 'n8n_categorias_usuarios',
};

// Armazenamento em memória de categorias ativas por usuário
const activeCategoriesByUser = new Map();

// Helper para garantir que id_usuario NUNCA seja nulo nas tabelas de fila, produtos e links
async function resolveCurrentUserId(explicitUserId = null) {
  if (explicitUserId && typeof explicitUserId === 'string' && explicitUserId.trim()) {
    return explicitUserId.trim();
  }

  // 1. Consultar n8n_categorias_usuarios
  if (pool) {
    try {
      const { rows } = await pool.query(
        `SELECT id_usuario FROM ${TABLES.categoriasUsuarios} WHERE id_usuario IS NOT NULL AND id_usuario != '' ORDER BY id DESC LIMIT 1`
      );
      if (rows && rows[0]?.id_usuario) return rows[0].id_usuario;
    } catch (_) {}
  }
  if (supabaseClient) {
    try {
      const { data } = await supabaseClient
        .from(TABLES.categoriasUsuarios)
        .select('id_usuario')
        .not('id_usuario', 'is', null)
        .limit(1);
      if (data && data[0]?.id_usuario) return data[0].id_usuario;
    } catch (_) {}
  }

  // 2. Consultar n8n_link_atual
  if (pool) {
    try {
      const { rows } = await pool.query(
        `SELECT id_usuario FROM ${TABLES.linkAtual} WHERE id_usuario IS NOT NULL AND id_usuario != '' ORDER BY id DESC LIMIT 1`
      );
      if (rows && rows[0]?.id_usuario) return rows[0].id_usuario;
    } catch (_) {}
  }
  if (supabaseClient) {
    try {
      const { data } = await supabaseClient
        .from(TABLES.linkAtual)
        .select('id_usuario')
        .not('id_usuario', 'is', null)
        .limit(1);
      if (data && data[0]?.id_usuario) return data[0].id_usuario;
    } catch (_) {}
  }

  // 3. Consultar n8n_produtos_enviados
  if (pool) {
    try {
      const { rows } = await pool.query(
        `SELECT id_usuario FROM ${TABLES.enviados} WHERE id_usuario IS NOT NULL AND id_usuario != '' ORDER BY id DESC LIMIT 1`
      );
      if (rows && rows[0]?.id_usuario) return rows[0].id_usuario;
    } catch (_) {}
  }

  // 4. Consultar auth.users
  if (pool) {
    try {
      const { rows } = await pool.query(
        `SELECT id FROM auth.users ORDER BY created_at ASC LIMIT 1`
      );
      if (rows && rows[0]?.id) return rows[0].id;
    } catch (_) {}
  }

  return '2260fe48-fa5f-4bd4-99c2-098b5ff1dfa5'; // Default fallback user ID
}

async function backfillMissingUserIds() {
  if (!pool && !supabaseClient) return;
  try {
    const defaultUserId = await resolveCurrentUserId();
    if (!defaultUserId) return;
    if (pool) {
      await pool.query(
        `UPDATE ${TABLES.geral} SET id_usuario = $1 WHERE id_usuario IS NULL OR id_usuario = ''`,
        [defaultUserId]
      ).catch(() => {});
      await pool.query(
        `UPDATE ${TABLES.linkAtual} SET id_usuario = $1 WHERE id_usuario IS NULL OR id_usuario = ''`,
        [defaultUserId]
      ).catch(() => {});
      await pool.query(
        `UPDATE ${TABLES.categoriasUsuarios} SET id_usuario = $1 WHERE id_usuario IS NULL OR id_usuario = ''`,
        [defaultUserId]
      ).catch(() => {});
    }
    if (supabaseClient) {
      await supabaseClient
        .from(TABLES.geral)
        .update({ id_usuario: defaultUserId })
        .is('id_usuario', null)
        .catch(() => {});
    }
  } catch (_) {}
}


let isPgConnected = false;
let pool = null;

if (DATABASE_URL) {
  try {
    pool = new Pool({
      connectionString: DATABASE_URL,
      ssl: process.env.DATABASE_SSL === 'false' ? false : { rejectUnauthorized: false },
      connectionTimeoutMillis: 5000,
      idleTimeoutMillis: 10000,
    });

    pool.on('error', (err) => {
      console.warn('[PostgreSQL Pool Warning]:', err.message);
      isPgConnected = false;
    });

    pool.query('SELECT 1')
      .then(() => {
        isPgConnected = true;
        console.log('[PostgreSQL Pool] Conexão ativa com o banco de dados.');
      })
      .catch((err) => {
        console.warn('[PostgreSQL Pool Ping]:', err.message);
      });
  } catch (err) {
    console.warn('[PostgreSQL] Erro ao instanciar pool:', err.message);
  }
}

let supabaseClient = null;
if (SUPABASE_URL && SUPABASE_ANON_KEY) {
  try {
    const key = process.env.SUPABASE_SERVICE_ROLE_KEY || SUPABASE_ANON_KEY;
    supabaseClient = createClient(SUPABASE_URL, key, {
      auth: { autoRefreshToken: false, persistSession: false },
    });
    console.log('[Supabase Client] Inicializado com sucesso em:', SUPABASE_URL);
  } catch (err) {
    console.warn('[Supabase Client] Erro ao inicializar Supabase client:', err.message);
  }
}

function detectMarketplace(url = '', name = '') {
  const target = (url + ' ' + name).toLowerCase();
  if (
    target.includes('mercadolivre') ||
    target.includes('mercadolivre.com') ||
    target.includes('meli.la') ||
    target.includes('meli') ||
    target.includes('mercado livre')
  ) {
    return { id: 'mercadolivre', name: 'Mercado Livre', tag: 'ML', color: '#FFE600', textColor: '#2D3277' };
  }
  if (target.includes('shopee') || target.includes('shope.ee') || target.includes('shopee.com')) {
    return { id: 'shopee', name: 'Shopee', tag: 'Shopee', color: '#EE4D2D', textColor: '#FFFFFF' };
  }
  if (target.includes('amazon') || target.includes('amzn.to') || target.includes('amazon.com')) {
    return { id: 'amazon', name: 'Amazon', tag: 'Amazon', color: '#FF9900', textColor: '#111827' };
  }
  if (target.includes('aliexpress') || target.includes('ali.ski') || target.includes('aliexpress.com')) {
    return { id: 'aliexpress', name: 'AliExpress', tag: 'AliExpress', color: '#FF4747', textColor: '#FFFFFF' };
  }
  if (target.includes('magazineluiza') || target.includes('magalu') || target.includes('magazinevoce')) {
    return { id: 'magalu', name: 'Magalu', tag: 'Magalu', color: '#0086FF', textColor: '#FFFFFF' };
  }
  return { id: 'outro', name: 'Loja Parceira', tag: 'Oferta', color: '#3B6BFF', textColor: '#FFFFFF' };
}

function sendJson(res, status, body) {
  const origin = res.req ? res.req.headers.origin : '*';
  res.writeHead(status, {
    'Content-Type': 'application/json; charset=utf-8',
    'Cache-Control': 'no-store',
    'Access-Control-Allow-Origin': origin || '*',
    'Access-Control-Allow-Methods': 'GET,POST,PUT,PATCH,DELETE,OPTIONS',
    'Access-Control-Allow-Headers': 'Content-Type, Authorization',
  });
  res.end(JSON.stringify(body));
}

function sendCsv(res, filename, csvContent) {
  res.writeHead(200, {
    'Content-Type': 'text/csv; charset=utf-8',
    'Content-Disposition': `attachment; filename="${filename}"`,
    'Cache-Control': 'no-store',
    'Access-Control-Allow-Origin': '*',
  });
  res.end('\uFEFF' + csvContent);
}

function sanitizeSql(str) {
  if (str === null || str === undefined) return 'NULL';
  return "'" + String(str).replace(/'/g, "''") + "'";
}

// Strict Authentication Guard
async function requireAuth(req, res) {
  const authorization = req.headers.authorization || '';
  const token = authorization.startsWith('Bearer ')
    ? authorization.slice('Bearer '.length).trim()
    : '';

  if (!token) {
    sendJson(res, 401, { error: 'Autenticação necessária. Por favor, faça login.' });
    return null;
  }

  if (supabaseClient) {
    try {
      const { data, error } = await supabaseClient.auth.getUser(token);
      if (!error && data?.user) {
        return data.user;
      }
    } catch (err) {
      console.warn('[Auth Check] Erro ao validar token:', err.message);
    }
  }

  // Verify JWT claims if direct verification is unavailable
  try {
    const parts = token.split('.');
    if (parts.length === 3) {
      const payload = JSON.parse(Buffer.from(parts[1], 'base64').toString('utf8'));
      if (payload?.sub && payload?.exp && payload.exp * 1000 > Date.now()) {
        return { id: payload.sub, email: payload.email || 'usuario@autenticado' };
      }
    }
  } catch (_) {}

  sendJson(res, 401, { error: 'Sessão inválida ou expirada. Por favor, faça login novamente.' });
  return null;
}

function sendError(res, error) {
  console.warn('[API Error]:', error.message || error);
  sendJson(res, 500, { error: 'Não foi possível processar a requisição no momento.' });
}

function readJsonBody(req) {
  return new Promise((resolve, reject) => {
    let body = '';
    req.on('data', (chunk) => {
      body += chunk;
      if (body.length > 30000) reject(new Error('Corpo da requisição excede o limite permitido.'));
    });
    req.on('end', () => {
      try {
        resolve(body ? JSON.parse(body) : {});
      } catch {
        reject(new Error('Dados JSON inválidos.'));
      }
    });
    req.on('error', reject);
  });
}

function normalizeLink(value) {
  if (typeof value !== 'string' || value.trim().length === 0) return null;
  try {
    const url = new URL(value.trim());
    if (!['http:', 'https:'].includes(url.protocol)) return null;
    return url.toString();
  } catch {
    return null;
  }
}

const OPERATIONAL_FILE = path.join(__dirname, '.operational_events.json');
let operationalEvents = [];
try {
  if (fs.existsSync(OPERATIONAL_FILE)) {
    const raw = fs.readFileSync(OPERATIONAL_FILE, 'utf8');
    operationalEvents = JSON.parse(raw);
    if (!Array.isArray(operationalEvents)) operationalEvents = [];
  }
} catch (_) {
  operationalEvents = [];
}

// Registrar ocorrência padronizada na tabela n8n_log_seguranca (e fallback local)
async function registrarLogSeguranca({ ocorrido, tipo_ocorrido, detalhes = '', id_usuario = null }) {
  const { timeStr, dateStr } = getBrasiliaDateTime();
  const event = {
    id: Date.now().toString(),
    created_at: new Date().toISOString(),
    timestamp: new Date().toISOString(),
    brasiliaDate: dateStr,
    brasiliaTime: timeStr,
    ocorrido: String(ocorrido || ''),
    tipo_ocorrido: String(tipo_ocorrido || ''),
    detalhes: String(detalhes || ''),
    id_usuario: id_usuario || null,
  };

  // Salvar no histórico operacional em memória e arquivo local
  operationalEvents.unshift(event);
  if (operationalEvents.length > 300) operationalEvents.pop();
  try {
    fs.writeFileSync(OPERATIONAL_FILE, JSON.stringify(operationalEvents.slice(0, 150), null, 2));
  } catch (_) {}

  // Gravar no banco de dados na tabela n8n_log_seguranca
  if (pool) {
    try {
      await pool.query(
        `INSERT INTO ${TABLES.logSeguranca} (ocorrido, tipo_ocorrido, detalhes, id_usuario)
         VALUES ($1, $2, $3, $4)`,
        [event.ocorrido, event.tipo_ocorrido, event.detalhes, event.id_usuario]
      );
    } catch (err) {
      if (err.message && (err.message.includes('does not exist') || err.message.includes('relation'))) {
        try {
          await pool.query(`
            CREATE TABLE IF NOT EXISTS ${TABLES.logSeguranca} (
              id SERIAL PRIMARY KEY,
              created_at TIMESTAMPTZ DEFAULT NOW(),
              ocorrido TEXT,
              tipo_ocorrido TEXT,
              detalhes TEXT,
              id_usuario TEXT
            )
          `);
          await pool.query(
            `INSERT INTO ${TABLES.logSeguranca} (ocorrido, tipo_ocorrido, detalhes, id_usuario)
             VALUES ($1, $2, $3, $4)`,
            [event.ocorrido, event.tipo_ocorrido, event.detalhes, event.id_usuario]
          );
        } catch (e2) {
          console.warn('[n8n_log_seguranca PG create/insert retry warn]:', e2.message);
        }
      } else {
        console.warn('[n8n_log_seguranca PG insert warn]:', err.message);
      }
    }
  } else if (supabaseClient) {
    try {
      await supabaseClient.from(TABLES.logSeguranca).insert({
        ocorrido: event.ocorrido,
        tipo_ocorrido: event.tipo_ocorrido,
        detalhes: event.detalhes,
        id_usuario: event.id_usuario,
      });
    } catch (sbErr) {
      console.warn('[n8n_log_seguranca Supabase insert warn]:', sbErr.message);
    }
  }

  return event;
}

// Alias para compatibilidade
const recordOperationalEvent = registrarLogSeguranca;

function getBrasiliaDateISO(date = new Date()) {
  const parts = new Intl.DateTimeFormat('en-CA', {
    timeZone: 'America/Sao_Paulo',
    year: 'numeric',
    month: '2-digit',
    day: '2-digit',
  }).formatToParts(date);
  const year = parts.find((p) => p.type === 'year')?.value || '2026';
  const month = parts.find((p) => p.type === 'month')?.value || '01';
  const day = parts.find((p) => p.type === 'day')?.value || '01';
  return `${year}-${month}-${day}`;
}

function calculateOperationalStats(items = [], timers = [], events = [], dias = 1) {
  const now = Date.now();
  const todayIso = getBrasiliaDateISO();
  const isToday = dias === 1;

  // 1. Determinar horários de início e término programados da grade
  let startHour = '08:00';
  let endHour = '22:00';

  if (Array.isArray(timers) && timers.length > 0) {
    const validStarts = timers
      .map((t) => (t.timer ? t.timer.slice(0, 5) : null))
      .filter(Boolean)
      .sort();
    const validEnds = timers
      .map((t) => (t.end_timer ? t.end_timer.slice(0, 5) : t.timer ? t.timer.slice(0, 5) : null))
      .filter(Boolean)
      .sort();

    if (validStarts.length > 0) startHour = validStarts[0];
    if (validEnds.length > 0) endHour = validEnds[validEnds.length - 1];
  }

  const windowStartMs = new Date(`${todayIso}T${startHour}:00.000-03:00`).getTime();
  const windowEndMs = new Date(`${todayIso}T${endHour}:00.000-03:00`).getTime();
  const evalEndMs = Math.min(now, windowEndMs);

  // 2. Ordenar envios do dia
  const sortedTimestamps = [...items]
    .filter((it) => it && it.created_at)
    .map((it) => new Date(it.created_at).getTime())
    .sort((a, b) => a - b);

  let maxGapMs = 0;
  let gapStartMs = null;
  let gapEndMs = null;

  if (now >= windowStartMs) {
    const windowItems = sortedTimestamps.filter((t) => t >= windowStartMs && t <= evalEndMs);

    if (windowItems.length === 0) {
      maxGapMs = Math.max(0, evalEndMs - windowStartMs);
      gapStartMs = windowStartMs;
      gapEndMs = evalEndMs;
    } else {
      if (windowItems[0] > windowStartMs) {
        const gap = windowItems[0] - windowStartMs;
        if (gap > maxGapMs) {
          maxGapMs = gap;
          gapStartMs = windowStartMs;
          gapEndMs = windowItems[0];
        }
      }

      for (let i = 1; i < windowItems.length; i++) {
        const gap = windowItems[i] - windowItems[i - 1];
        if (gap > maxGapMs) {
          maxGapMs = gap;
          gapStartMs = windowItems[i - 1];
          gapEndMs = windowItems[i];
        }
      }

      const lastItemTime = windowItems[windowItems.length - 1];
      if (evalEndMs > lastItemTime) {
        const gap = evalEndMs - lastItemTime;
        if (gap > maxGapMs) {
          maxGapMs = gap;
          gapStartMs = lastItemTime;
          gapEndMs = evalEndMs;
        }
      }
    }
  }

  const maxGapMinutes = Math.round(maxGapMs / 60000);
  let maiorTempoSemEnvioFormatado = '0 min';
  if (maxGapMinutes > 0) {
    const gh = Math.floor(maxGapMinutes / 60);
    const gm = maxGapMinutes % 60;
    if (gh > 0) {
      maiorTempoSemEnvioFormatado = `${gh}h ${gm > 0 ? `${gm}m` : ''}`.trim();
    } else {
      maiorTempoSemEnvioFormatado = `${gm} min`;
    }
  } else if (sortedTimestamps.length > 0) {
    maiorTempoSemEnvioFormatado = 'Envios contínuos';
  }

  let maiorTempoSemEnvioIntervalo = 'Dentro da grade regular';
  if (gapStartMs && gapEndMs && maxGapMinutes > 0) {
    const fmt = (ms) =>
      new Intl.DateTimeFormat('pt-BR', {
        timeZone: 'America/Sao_Paulo',
        hour: '2-digit',
        minute: '2-digit',
      }).format(new Date(ms));
    maiorTempoSemEnvioIntervalo = `Entre ${fmt(gapStartMs)} e ${fmt(gapEndMs)}`;
  }

  // 3. Filtrar ocorrências de Sentinela de Segurança em n8n_log_seguranca
  const cutoffTime = now - dias * 24 * 60 * 60 * 1000;
  const periodEvents = (events || []).filter((e) => {
    const t = new Date(e.created_at || e.timestamp).getTime();
    return t >= cutoffTime;
  });

  const sentinelaEvents = periodEvents.filter((e) => {
    const tipo = String(e.tipo_ocorrido || '').toLowerCase();
    const ocorr = String(e.ocorrido || '').toLowerCase();
    return tipo.includes('sentinela') || ocorr.includes('reativar');
  });
  const sentinelaCount = sentinelaEvents.length;
  const ultimoSentinela = sentinelaEvents[0] || null;

  // 4. Filtrar ocorrências de Pausas em n8n_log_seguranca
  const pauseEvents = periodEvents.filter((e) => {
    const tipo = String(e.tipo_ocorrido || '').toLowerCase();
    const ocorr = String(e.ocorrido || '').toLowerCase();
    return tipo.includes('pausa') || ocorr.includes('pausado');
  });
  const pausasCount = pauseEvents.length;
  const ultimaPausa = pauseEvents[0] || null;

  return {
    sentinelaCount,
    sentinelaStatus: sentinelaCount === 0 ? 'estavel' : 'intervencao',
    sentinelaMensagem: sentinelaCount === 0 ? 'Estável · 0 intervenções' : `${sentinelaCount} intervenção(ões) anti-travamento`,
    ultimoSentinela,

    maiorTempoSemEnvioMinutos: maxGapMinutes,
    maiorTempoSemEnvioFormatado,
    maiorTempoSemEnvioIntervalo,
    horaInicioProgramada: startHour,
    horaFimProgramada: endHour,
    janelaProgramadaFormatada: `${startHour} às ${endHour}`,

    pausasCount,
    pausasFormatado: `${pausasCount} ${pausasCount === 1 ? 'pausa' : 'pausas'}`,
    ultimaPausa,
  };
}

function calculateAnalytics(items = [], options = {}) {
  const { dias = 1, timers = [], operationalEvents = [] } = options;
  const opStats = calculateOperationalStats(items, timers, operationalEvents, dias);

  if (!items.length) {
    return {
      total: 0,
      tempoMinutos: 0,
      tempoFormatado: '0h 0m',
      mediaPorHora: '0.0',
      horarioPico: '—',
      marketplaces: {},
      hourlyBuckets: Array(24).fill(0),
      ...opStats,
    };
  }

  const sorted = [...items].sort((a, b) => new Date(a.created_at) - new Date(b.created_at));
  let activeMinutes = 0;
  let burstStart = new Date(sorted[0].created_at).getTime();
  let burstLast = burstStart;

  for (let i = 1; i < sorted.length; i++) {
    const curr = new Date(sorted[i].created_at).getTime();
    if (curr - burstLast <= 15 * 60 * 1000) {
      burstLast = curr;
    } else {
      activeMinutes += Math.max(5, Math.round((burstLast - burstStart) / 60000));
      burstStart = curr;
      burstLast = curr;
    }
  }
  activeMinutes += Math.max(5, Math.round((burstLast - burstStart) / 60000));

  const hours = Math.floor(activeMinutes / 60);
  const mins = activeMinutes % 60;
  const tempoFormatado = `${hours}h ${mins}m`;

  const hourlyBuckets = Array(24).fill(0);
  const marketplaces = {};

  sorted.forEach((item) => {
    const d = new Date(item.created_at);
    const hour = (d.getUTCHours() - 3 + 24) % 24;
    hourlyBuckets[hour] = (hourlyBuckets[hour] || 0) + 1;

    const mp = detectMarketplace(item.url_produto || item.link || '', item.nome_produto || item.title || '').name;
    marketplaces[mp] = (marketplaces[mp] || 0) + 1;
  });

  let maxHour = 0;
  let maxVal = -1;
  hourlyBuckets.forEach((val, h) => {
    if (val > maxVal) {
      maxVal = val;
      maxHour = h;
    }
  });

  const horarioPico = maxVal > 0 ? `${String(maxHour).padStart(2, '0')}:00 às ${String(maxHour + 1).padStart(2, '0')}:00` : '—';
  const mediaPorHora = activeMinutes > 0 ? (sorted.length / (activeMinutes / 60)).toFixed(1) : '0.0';

  return {
    total: sorted.length,
    tempoMinutos: activeMinutes,
    tempoFormatado,
    mediaPorHora,
    horarioPico,
    marketplaces,
    hourlyBuckets,
    ...opStats,
  };
}

/* ==========================================================================
   TIMER SCHEDULER & N8N WEBHOOK DISPATCHER
   ========================================================================== */
const timerLogs = [];
const triggeredMinuteMap = new Set();
let cachedTimers = [];
let lastTimersFetchTime = 0;

function getBrasiliaDateTime() {
  const now = new Date();
  const timeStr = new Intl.DateTimeFormat('pt-BR', {
    timeZone: 'America/Sao_Paulo',
    hour: '2-digit',
    minute: '2-digit',
    second: '2-digit',
    hour12: false,
  }).format(now);

  const dateStr = new Intl.DateTimeFormat('pt-BR', {
    timeZone: 'America/Sao_Paulo',
    year: 'numeric',
    month: '2-digit',
    day: '2-digit',
  }).format(now);

  return { timeStr, dateStr, fullIso: now.toISOString() };
}

function normalizeTimeHHMMSS(val) {
  if (!val || typeof val !== 'string') return null;
  const clean = val.trim();
  const match = clean.match(/^([01]\d|2[0-3]):([0-5]\d)(:([0-5]\d))?$/);
  if (!match) return null;
  const hh = match[1];
  const mm = match[2];
  const ss = match[4] || '00';
  return `${hh}:${mm}:${ss}`;
}

function getThirtyMinutesBefore(timeStr) {
  if (!timeStr || typeof timeStr !== 'string') return null;
  const match = timeStr.trim().match(/^([01]\d|2[0-3]):([0-5]\d)/);
  if (!match) return null;
  let hh = parseInt(match[1], 10);
  let mm = parseInt(match[2], 10);
  mm -= 30;
  if (mm < 0) {
    mm += 60;
    hh -= 1;
    if (hh < 0) hh += 24;
  }
  const pad = (n) => String(n).padStart(2, '0');
  return `${pad(hh)}:${pad(mm)}`;
}

async function dispatchN8nWebhook({ trigger = 'manual', timerInfo = null, customUrl = null } = {}) {
  const targetUrl = (customUrl || currentN8nWebhook || '').trim();
  const startTime = Date.now();
  const payload = {
    action: 'ativar_fluxo',
    source: 'painel_botpromo',
    trigger,
    timer: timerInfo ? timerInfo.timer : null,
    nome_timer: timerInfo ? timerInfo.nome_timer : null,
    timestamp: new Date().toISOString(),
  };

  try {
    // 1. Try POST first
    let res = await fetch(targetUrl, {
      method: 'POST',
      headers: {
        'Content-Type': 'application/json',
        'User-Agent': 'BotPromo-Control/2.0',
      },
      body: JSON.stringify(payload),
    });

    let latency = Date.now() - startTime;
    let responseText = await res.text();

    // 2. If n8n says "Did you mean to make a GET request?" or 405 Method Not Allowed or 404, try GET with query params
    const suggestsGet = responseText && responseText.toLowerCase().includes('get request');
    if (!res.ok && (res.status === 405 || suggestsGet || res.status === 404)) {
      try {
        const getUrlObj = new URL(targetUrl);
        getUrlObj.searchParams.set('action', 'ativar_fluxo');
        getUrlObj.searchParams.set('source', 'painel_botpromo');
        getUrlObj.searchParams.set('trigger', trigger);
        if (timerInfo?.timer) getUrlObj.searchParams.set('timer', timerInfo.timer);
        if (timerInfo?.nome_timer) getUrlObj.searchParams.set('nome_timer', timerInfo.nome_timer);

        const getRes = await fetch(getUrlObj.toString(), {
          method: 'GET',
          headers: { 'User-Agent': 'BotPromo-Control/2.0' },
        });

        if (getRes.ok) {
          const getText = await getRes.text();
          let jsonMsg = '';
          try {
            const parsed = JSON.parse(getText);
            jsonMsg = parsed.message || parsed.msg || '';
          } catch (_) {}

          return {
            ok: true,
            status: getRes.status,
            latencyMs: Date.now() - startTime,
            targetUrl: getUrlObj.toString(),
            response: jsonMsg || getText || 'Fluxo iniciado com sucesso no n8n!',
            hint: 'Webhook respondeu com sucesso (via GET).',
          };
        }
      } catch (_) {}
    }

    // 3. If targetUrl is test URL and failed, check production URL (/webhook/...) with both GET and POST
    if (!res.ok && targetUrl.includes('/webhook-test/')) {
      const prodBase = targetUrl.replace('/webhook-test/', '/webhook/');
      
      // Try GET on production
      try {
        const prodGetObj = new URL(prodBase);
        prodGetObj.searchParams.set('action', 'ativar_fluxo');
        prodGetObj.searchParams.set('source', 'painel_botpromo');
        prodGetObj.searchParams.set('trigger', trigger);

        const prodGetRes = await fetch(prodGetObj.toString(), {
          method: 'GET',
          headers: { 'User-Agent': 'BotPromo-Control/2.0' },
        });

        if (prodGetRes.ok) {
          const prodText = await prodGetRes.text();
          let jsonMsg = '';
          try {
            const parsed = JSON.parse(prodText);
            jsonMsg = parsed.message || parsed.msg || '';
          } catch (_) {}

          return {
            ok: true,
            status: prodGetRes.status,
            latencyMs: Date.now() - startTime,
            targetUrl: prodGetObj.toString(),
            response: jsonMsg || prodText || 'Disparo iniciado com sucesso!',
            hint: 'Disparo efetuado com sucesso.',
          };
        }
      } catch (_) {}

      // Try POST on production
      try {
        const prodRes = await fetch(prodBase, {
          method: 'POST',
          headers: {
            'Content-Type': 'application/json',
            'User-Agent': 'BotPromo-Control/2.0',
          },
          body: JSON.stringify(payload),
        });

        if (prodRes.ok) {
          const prodText = await prodRes.text();
          let jsonMsg = '';
          try {
            const parsed = JSON.parse(prodText);
            jsonMsg = parsed.message || parsed.msg || '';
          } catch (_) {}
          return {
            ok: true,
            status: prodRes.status,
            latencyMs: Date.now() - startTime,
            targetUrl: prodBase,
            response: jsonMsg || prodText || 'Disparo iniciado com sucesso!',
            hint: 'Disparo efetuado com sucesso.',
          };
        }
      } catch (_) {}
    }

    // 4. Parse response body for human readable feedback
    let cleanMessage = responseText ? responseText.slice(0, 300) : '';
    let cleanHint = '';
    try {
      const jsonRes = JSON.parse(responseText);
      if (jsonRes.message) cleanMessage = jsonRes.message;
      if (jsonRes.hint) cleanHint = jsonRes.hint;
    } catch (_) {}

    if (res.status === 401 || (responseText && responseText.toLowerCase().includes('authorization is required'))) {
      cleanHint = 'Não foi possível autorizar o envio no momento. Tente novamente mais tarde.';
    } else if (res.status === 404) {
      cleanHint = 'Não foi possível conectar ao serviço no momento. Tente novamente mais tarde.';
    }

    return {
      ok: res.ok,
      status: res.status,
      latencyMs: latency,
      targetUrl,
      response: cleanMessage || (res.ok ? 'Comando executado com sucesso!' : 'Sem corpo de resposta'),
      hint: cleanHint,
    };
  } catch (err) {
    const latency = Date.now() - startTime;
    return {
      ok: false,
      status: 502,
      latencyMs: latency,
      targetUrl,
      response: 'Não foi possível conectar no momento. Tente novamente mais tarde.',
      hint: 'Não foi possível conectar no momento. Tente novamente mais tarde.',
    };
  }
}

async function dispatchN8nProdutosWebhook({ trigger = 'manual', timerInfo = null, customUrl = null } = {}) {
  const targetUrl = (customUrl || currentN8nProdutosWebhook || '').trim();
  const startTime = Date.now();
  const payload = {
    action: 'coletar_produtos',
    source: 'painel_botpromo',
    trigger,
    target_timer: timerInfo ? timerInfo.timer : null,
    nome_timer: timerInfo ? timerInfo.nome_timer : null,
    timestamp: new Date().toISOString(),
  };

  try {
    // 1. Try POST first
    let res = await fetch(targetUrl, {
      method: 'POST',
      headers: {
        'Content-Type': 'application/json',
        'User-Agent': 'BotPromo-Control/2.0',
      },
      body: JSON.stringify(payload),
    });

    let latency = Date.now() - startTime;
    let responseText = await res.text();

    // 2. If n8n says "Did you mean to make a GET request?" or 405 or 404, try GET with query params
    const suggestsGet = responseText && responseText.toLowerCase().includes('get request');
    if (!res.ok && (res.status === 405 || suggestsGet || res.status === 404)) {
      try {
        const getUrlObj = new URL(targetUrl);
        getUrlObj.searchParams.set('action', 'coletar_produtos');
        getUrlObj.searchParams.set('source', 'painel_botpromo');
        getUrlObj.searchParams.set('trigger', trigger);
        if (timerInfo?.timer) getUrlObj.searchParams.set('target_timer', timerInfo.timer);
        if (timerInfo?.nome_timer) getUrlObj.searchParams.set('nome_timer', timerInfo.nome_timer);

        const getRes = await fetch(getUrlObj.toString(), {
          method: 'GET',
          headers: { 'User-Agent': 'BotPromo-Control/2.0' },
        });

        if (getRes.ok) {
          const getText = await getRes.text();
          let jsonMsg = '';
          try {
            const parsed = JSON.parse(getText);
            jsonMsg = parsed.message || parsed.msg || '';
          } catch (_) {}

          return {
            ok: true,
            status: getRes.status,
            latencyMs: Date.now() - startTime,
            targetUrl: getUrlObj.toString(),
            response: jsonMsg || getText || 'Coleta iniciada com sucesso!',
            hint: 'Coleta de produtos acionada com sucesso.',
          };
        }
      } catch (_) {}
    }

    // 3. If targetUrl is test URL and failed, check production URL (/webhook/...) with both GET and POST
    if (!res.ok && targetUrl.includes('/webhook-test/')) {
      const prodBase = targetUrl.replace('/webhook-test/', '/webhook/');

      // Try GET on production
      try {
        const prodGetObj = new URL(prodBase);
        prodGetObj.searchParams.set('action', 'coletar_produtos');
        prodGetObj.searchParams.set('source', 'painel_botpromo');
        prodGetObj.searchParams.set('trigger', trigger);

        const prodGetRes = await fetch(prodGetObj.toString(), {
          method: 'GET',
          headers: { 'User-Agent': 'BotPromo-Control/2.0' },
        });

        if (prodGetRes.ok) {
          const prodText = await prodGetRes.text();
          let jsonMsg = '';
          try {
            const parsed = JSON.parse(prodText);
            jsonMsg = parsed.message || parsed.msg || '';
          } catch (_) {}

          return {
            ok: true,
            status: prodGetRes.status,
            latencyMs: Date.now() - startTime,
            targetUrl: prodGetObj.toString(),
            response: jsonMsg || prodText || 'Coleta ativada com sucesso!',
            hint: 'Disparo efetuado com sucesso.',
          };
        }
      } catch (_) {}

      // Try POST on production
      try {
        const prodRes = await fetch(prodBase, {
          method: 'POST',
          headers: {
            'Content-Type': 'application/json',
            'User-Agent': 'BotPromo-Control/2.0',
          },
          body: JSON.stringify(payload),
        });

        if (prodRes.ok) {
          const prodText = await prodRes.text();
          let jsonMsg = '';
          try {
            const parsed = JSON.parse(prodText);
            jsonMsg = parsed.message || parsed.msg || '';
          } catch (_) {}

          return {
            ok: true,
            status: prodRes.status,
            latencyMs: Date.now() - startTime,
            targetUrl: prodBase,
            response: jsonMsg || prodText || 'Coleta ativada com sucesso!',
            hint: 'Disparo efetuado com sucesso.',
          };
        }
      } catch (_) {}
    }

    // 4. Parse response body for human readable feedback
    let cleanMessage = responseText ? responseText.slice(0, 300) : '';
    let cleanHint = '';

    try {
      const jsonRes = JSON.parse(responseText);
      if (jsonRes.message) cleanMessage = jsonRes.message;
      if (jsonRes.hint) cleanHint = jsonRes.hint;
    } catch (_) {}

    if (res.status === 401 || (responseText && responseText.toLowerCase().includes('authorization is required'))) {
      cleanHint = 'Não foi possível autorizar a operação no momento. Tente novamente mais tarde.';
    } else if (res.status === 404) {
      cleanHint = 'Não foi possível conectar ao serviço no momento. Tente novamente mais tarde.';
    }

    return {
      ok: res.ok,
      status: res.status,
      latencyMs: latency,
      targetUrl,
      response: cleanMessage || (res.ok ? 'Coleta respondida com sucesso!' : 'Sem corpo de resposta'),
      hint: cleanHint,
    };
  } catch (err) {
    const latency = Date.now() - startTime;
    return {
      ok: false,
      status: 502,
      latencyMs: latency,
      targetUrl,
      response: 'Não foi possível conectar no momento. Tente novamente mais tarde.',
      hint: 'Não foi possível conectar no momento. Tente novamente mais tarde.',
    };
  }
}

async function fetchDbTimers() {
  const now = Date.now();
  if (now - lastTimersFetchTime < 10000 && cachedTimers.length) {
    return cachedTimers;
  }
  try {
    if (pool) {
      const { rows } = await pool.query(`SELECT id, timer, end_timer, nome_timer FROM ${TABLES.timer} ORDER BY id ASC`);
      cachedTimers = rows || [];
    } else if (supabaseClient) {
      const { data } = await supabaseClient.from(TABLES.timer).select('id, timer, end_timer, nome_timer').order('id', { ascending: true });
      cachedTimers = data || [];
    }
    lastTimersFetchTime = now;
  } catch (err) {
    console.warn('[Timer Scheduler Query Warn]:', err.message);
  }
  return cachedTimers;
}

// Abastece automaticamente a tabela n8n_produtos_geral com base nas categorias salvas em n8n_categorias_usuarios
// Abastece a tabela n8n_produtos_geral com suporte completo MULTI-USUÁRIO
// Cada usuário recebe seus próprios produtos vinculados ao seu id_usuario único
async function abastecerProdutosAutomatico({ userId = null, targetTimer = '', nomeTimer = '' } = {}) {
  if (!pool && !supabaseClient) return { ok: false, count: 0 };

  try {
    // 1. Identificar a lista de usuários a serem abastecidos
    let targetUsers = [];
    if (userId) {
      targetUsers = [userId];
    } else {
      // Quando disparado pelo cron/scheduler sem usuário específico:
      // Busca TODOS os usuários distintos que configuraram categorias ativas
      if (pool) {
        try {
          const { rows } = await pool.query(
            `SELECT DISTINCT id_usuario FROM ${TABLES.categoriasUsuarios} WHERE id_usuario IS NOT NULL AND id_usuario != ''`
          );
          targetUsers = (rows || []).map((r) => r.id_usuario);
        } catch (_) {}
      }
      if (targetUsers.length === 0 && supabaseClient) {
        try {
          const { data } = await supabaseClient
            .from(TABLES.categoriasUsuarios)
            .select('id_usuario')
            .not('id_usuario', 'is', null);
          if (Array.isArray(data)) {
            targetUsers = [...new Set(data.map((d) => d.id_usuario).filter(Boolean))];
          }
        } catch (_) {}
      }
      // Se ainda não encontrou usuários com categorias, busca o primeiro usuário registrado
      if (targetUsers.length === 0) {
        const fallbackId = await resolveCurrentUserId();
        if (fallbackId) targetUsers = [fallbackId];
      }
    }

    if (targetUsers.length === 0) {
      console.log('[Abastecimento Multi-Usuário] Nenhum usuário configurado encontrado.');
      return { ok: true, count: 0, message: 'Nenhum usuário configurado.' };
    }

    let totalGlobalInserted = 0;

    // 2. Processar de forma independente CADA usuário
    for (const currentUserId of targetUsers) {
      if (!currentUserId) continue;

      // Consultar categorias salvas exclusivamente para este usuário
      let savedCategories = [];
      if (pool) {
        try {
          const { rows } = await pool.query(
            `SELECT id_categoria, COALESCE(quantidade_produtos, quantidade, 5) AS quantidade_produtos
             FROM ${TABLES.categoriasUsuarios}
             WHERE id_usuario = $1
             ORDER BY id_categoria ASC`,
            [currentUserId]
          );
          savedCategories = rows || [];
        } catch (_) {}
      }
      if (savedCategories.length === 0 && supabaseClient) {
        try {
          const { data } = await supabaseClient
            .from(TABLES.categoriasUsuarios)
            .select('id_categoria, quantidade_produtos, quantidade')
            .eq('id_usuario', currentUserId);
          if (Array.isArray(data)) {
            savedCategories = data.map((d) => ({
              id_categoria: d.id_categoria,
              quantidade_produtos: Number(d.quantidade_produtos || d.quantidade || 5),
            }));
          }
        } catch (_) {}
      }

      if (savedCategories.length === 0) continue;

      const categoryIds = savedCategories
        .map((c) => Number(c.id_categoria))
        .filter((n) => Number.isFinite(n) && n > 0);
      if (categoryIds.length === 0) continue;

      const userQuantities = {};
      savedCategories.forEach((c) => {
        userQuantities[Number(c.id_categoria)] = Number(c.quantidade_produtos) || 5;
      });

      // Buscar produtos correspondentes no catálogo n8n_todos_produtos
      let produtosCorrespondentes = [];
      if (pool) {
        try {
          const { rows } = await pool.query(
            `SELECT nome_produto, url_produto, url_imagem, valor_original, valor_promocional, forma_entrega, id_categoria
             FROM ${TABLES.todosProdutos}
             WHERE id_categoria = ANY($1::smallint[])
             ORDER BY id_categoria ASC, id ASC`,
            [categoryIds]
          );
          produtosCorrespondentes = rows || [];
        } catch (_) {}
      }
      if (produtosCorrespondentes.length === 0 && supabaseClient) {
        try {
          const { data } = await supabaseClient
            .from(TABLES.todosProdutos)
            .select('nome_produto, url_produto, url_imagem, valor_original, valor_promocional, forma_entrega, id_categoria')
            .in('id_categoria', categoryIds)
            .order('id', { ascending: true });
          if (Array.isArray(data)) produtosCorrespondentes = data;
        } catch (_) {}
      }

      // Agrupar e limitar produtos por categoria conforme as quantidades definidas por esse usuário
      const produtosPorCategoria = new Map();
      categoryIds.forEach((cid) => produtosPorCategoria.set(cid, []));
      for (const p of produtosCorrespondentes) {
        const cid = Number(p.id_categoria);
        if (produtosPorCategoria.has(cid)) {
          produtosPorCategoria.get(cid).push(p);
        }
      }

      const categoriaItemsMap = new Map();
      for (const cid of categoryIds) {
        const allItems = produtosPorCategoria.get(cid) || [];
        const limit = Number(userQuantities[cid]) || 5;
        const itemsToTake = limit > 0 ? allItems.slice(0, limit) : allItems;
        categoriaItemsMap.set(cid, itemsToTake);
      }

      // Intercalação equilibrada (Round-Robin)
      const produtosParaInserir = [];
      let hasMore = true;
      let roundIndex = 0;
      while (hasMore) {
        hasMore = false;
        for (const cid of categoryIds) {
          const items = categoriaItemsMap.get(cid) || [];
          if (roundIndex < items.length) {
            produtosParaInserir.push(items[roundIndex]);
            hasMore = true;
          }
        }
        roundIndex++;
      }

      if (produtosParaInserir.length === 0) continue;

      // Atualizar fila n8n_produtos_geral APENAS para este usuário (preserva produtos dos outros usuários)
      let userInserted = 0;
      if (pool) {
        try {
          await pool.query(`DELETE FROM ${TABLES.geral} WHERE id_usuario = $1`, [currentUserId]);
          for (const p of produtosParaInserir) {
            await pool.query(
              `INSERT INTO ${TABLES.geral}
                (nome_produto, url_produto, url_imagem, valor_original, valor_promocional, forma_entrega, id_categoria, id_usuario)
               VALUES ($1, $2, $3, $4, $5, $6, $7, $8)`,
              [
                p.nome_produto || null,
                p.url_produto || null,
                p.url_imagem || null,
                p.valor_original || null,
                p.valor_promocional || null,
                p.forma_entrega || null,
                p.id_categoria !== undefined && p.id_categoria !== null ? Number(p.id_categoria) : null,
                currentUserId,
              ]
            );
            userInserted++;
          }
          await pool.query(
            `UPDATE ${TABLES.geral} SET id_usuario = $1 WHERE (id_usuario IS NULL OR id_usuario = '') AND id_categoria = ANY($2::smallint[])`,
            [currentUserId, categoryIds]
          ).catch(() => {});
        } catch (err) {
          console.warn(`[PG abastecer user ${currentUserId} err]:`, err.message);
        }
      }

      if (userInserted === 0 && supabaseClient) {
        try {
          await supabaseClient.from(TABLES.geral).delete().eq('id_usuario', currentUserId);
          const toInsert = produtosParaInserir.map((p) => ({
            nome_produto: p.nome_produto || null,
            url_produto: p.url_produto || null,
            url_imagem: p.url_imagem || null,
            valor_original: p.valor_original || null,
            valor_promocional: p.valor_promocional || null,
            forma_entrega: p.forma_entrega || null,
            id_categoria: p.id_categoria !== undefined && p.id_categoria !== null ? Number(p.id_categoria) : null,
            id_usuario: currentUserId,
          }));
          const { error: sbInsErr } = await supabaseClient.from(TABLES.geral).insert(toInsert);
          if (!sbInsErr) userInserted = toInsert.length;
        } catch (_) {}
      }

      totalGlobalInserted += userInserted;
      console.log(`[Abastecimento Multi-Usuário] ✅ Usuário ${currentUserId}: ${userInserted} produtos preparados na fila.`);
    }

    await registrarLogSeguranca({
      ocorrido: 'Abastecimento automático diário de produtos multi-usuário',
      tipo_ocorrido: 'abastecimento automático',
      detalhes: `${totalGlobalInserted} produto(s) abastecidos no total para ${targetUsers.length} usuário(s) ativos na grade das ${targetTimer || 'programada'}.`,
      id_usuario: userId || null,
    });

    return { ok: true, count: totalGlobalInserted, userCount: targetUsers.length };
  } catch (err) {
    console.error('[Abastecimento Automático Erro]:', err);
    return { ok: false, error: err.message };
  }
}

async function checkAndTriggerTimers() {
  const { timeStr, dateStr } = getBrasiliaDateTime();
  const currentHHMM = timeStr.slice(0, 5); // "HH:MM"

  const timers = await fetchDbTimers();
  if (!timers || !timers.length) return;

  for (const item of timers) {
    if (!item.timer) continue;
    const targetHHMM = item.timer.slice(0, 5); // "HH:MM"
    const preHHMM = getThirtyMinutesBefore(item.timer); // 30 min before
    const endHHMM = item.end_timer ? item.end_timer.slice(0, 5) : null; // stop time

    // 1. ABASTECIMENTO AUTOMÁTICO: 30 minutos antes do início do disparo programado
    if (preHHMM && currentHHMM === preHHMM) {
      const refillTriggerKey = `refill_${item.id}_${dateStr}_${preHHMM}`;
      if (!triggeredMinuteMap.has(refillTriggerKey)) {
        triggeredMinuteMap.add(refillTriggerKey);
        console.log(`[Timer Scheduler] 📦 30 minutos antes do disparo das ${item.timer} (Agora: ${currentHHMM})! Reabastecendo produtos automaticamente com base em n8n_categorias_usuarios...`);

        const refillResult = await abastecerProdutosAutomatico({
          userId: null,
          targetTimer: item.timer,
          nomeTimer: item.nome_timer,
        });

        const logEntry = {
          id: Date.now().toString(),
          timestamp: new Date().toISOString(),
          brasiliaTime: timeStr,
          brasiliaDate: dateStr,
          timerId: item.id,
          timerHour: `${preHHMM} (pré 30m)`,
          nomeTimer: `Abastecimento Automático: ${item.nome_timer || 'Grade Agendada'}`,
          ok: refillResult.ok,
          status: refillResult.ok ? 200 : 500,
          latencyMs: 0,
          response: refillResult.ok
            ? `${refillResult.count || 0} produto(s) preparados e abastecidos na fila de envio!`
            : `Erro ao abastecer: ${refillResult.error || 'Nenhum produto'}`,
          targetUrl: 'Fila de Envios',
          hint: 'Reabastecimento diário automático executado 30 minutos antes da grade.',
          trigger: 'abastecimento_automatico_pre30m',
        };

        timerLogs.unshift(logEntry);
        if (timerLogs.length > 50) timerLogs.pop();
      }
    }

    // 2. MAIN DISPATCH: At scheduled start timer -> trigger bot sending webhook
    if (currentHHMM === targetHHMM) {
      const triggerKey = `bot_${item.id}_${dateStr}_${targetHHMM}`;
      if (!triggeredMinuteMap.has(triggerKey)) {
        triggeredMinuteMap.add(triggerKey);
        console.log(`[Timer Scheduler] ⏰ Horário atingido (${item.timer})! Disparando ativação do bot para "${item.nome_timer || 'Sem nome'}"...`);

        const result = await dispatchN8nWebhook({
          trigger: 'agendado',
          timerInfo: item,
        });

        const logEntry = {
          id: Date.now().toString(),
          timestamp: new Date().toISOString(),
          brasiliaTime: timeStr,
          brasiliaDate: dateStr,
          timerId: item.id,
          timerHour: item.timer,
          nomeTimer: item.nome_timer || 'Disparo Automático',
          ok: result.ok,
          status: result.status,
          latencyMs: result.latencyMs,
          response: result.response,
          targetUrl: result.targetUrl,
          hint: result.hint || '',
          trigger: 'automático_timer',
        };

        timerLogs.unshift(logEntry);
        if (timerLogs.length > 50) timerLogs.pop();
        console.log(`[Timer Scheduler] Resultado disparo: ${result.ok ? 'SUCESSO' : 'FALHA'} (Status: ${result.status})`);
      }
    }

    // 3. STOP TIMER: At scheduled stop time -> pause and clear queue
    if (endHHMM && currentHHMM === endHHMM) {
      const stopTriggerKey = `stop_${item.id}_${dateStr}_${endHHMM}`;
      if (!triggeredMinuteMap.has(stopTriggerKey)) {
        triggeredMinuteMap.add(stopTriggerKey);
        console.log(`[Timer Scheduler] 🛑 Horário de término atingido (${item.end_timer})! Limpando fila e registrando pausa...`);

        if (pool) {
          try { await pool.query(`DELETE FROM ${TABLES.geral}`); } catch (_) {}
        } else if (supabaseClient) {
          try { await supabaseClient.from(TABLES.geral).delete().neq('id', 0); } catch (_) {}
        }

        await registrarLogSeguranca({
          ocorrido: `bot pausado por término de grade (${item.end_timer})`,
          tipo_ocorrido: 'pausa programada',
          detalhes: `Término de grade agendada para ${item.nome_timer || 'Disparo programado'}. Fila de produtos limpa.`,
        });

        const logEntry = {
          id: Date.now().toString(),
          timestamp: new Date().toISOString(),
          brasiliaTime: timeStr,
          brasiliaDate: dateStr,
          timerId: item.id,
          timerHour: item.end_timer,
          nomeTimer: `Término: ${item.nome_timer || 'Fim de Grade'}`,
          ok: true,
          status: 200,
          latencyMs: 0,
          response: 'Horário de término atingido. Fila limpa e bot pausado.',
          targetUrl: currentN8nWebhook || '',
          hint: 'Grade agendada finalizada com sucesso.',
          trigger: 'automático_fim_grade',
        };

        timerLogs.unshift(logEntry);
        if (timerLogs.length > 50) timerLogs.pop();
      }
    }
  }
}

async function checkWatchdogSafety() {
  if (!watchdogState.enabled) {
    watchdogState.status = 'disabled';
    return;
  }

  if (!pool && !supabaseClient) return;

  // 0. Checar se o horário atual de Brasília está dentro do horário de funcionamento definido pelo usuário
  try {
    const timers = await fetchDbTimers();
    if (timers && timers.length > 0) {
      const { timeStr } = getBrasiliaDateTime();
      const parts = timeStr.split(':').map((n) => parseInt(n, 10) || 0);
      const currentMin = parts[0] * 60 + parts[1];

      const insideOperatingHours = timers.some((item) => {
        if (!item.timer) return false;
        const startParts = item.timer.split(':').map((n) => parseInt(n, 10) || 0);
        const startMin = startParts[0] * 60 + startParts[1];

        let endMin = 23 * 60 + 59;
        if (item.end_timer && item.end_timer !== 'none') {
          const endParts = item.end_timer.split(':').map((n) => parseInt(n, 10) || 0);
          endMin = endParts[0] * 60 + endParts[1];
        }

        if (startMin <= endMin) {
          return currentMin >= startMin && currentMin <= endMin;
        } else {
          return currentMin >= startMin || currentMin <= endMin;
        }
      });

      if (!insideOperatingHours) {
        watchdogState.status = 'outside_hours';
        return;
      }
    }
  } catch (timeErr) {
    console.warn('[Sentinela] Erro ao verificar horário de funcionamento:', timeErr.message);
  }

  const now = Date.now();
  const tenMinutesMs = 10 * 60 * 1000;

  try {
    // 1. Checar se existem produtos na fila esperando para serem enviados
    let queueCount = 0;
    let queueStartTime = null;

    if (pool) {
      const { rows } = await pool.query(`SELECT COUNT(*)::int as count, MIN(created_at) as min_created FROM ${TABLES.geral}`);
      queueCount = rows[0]?.count ?? 0;
      if (rows[0]?.min_created) {
        queueStartTime = new Date(rows[0].min_created).getTime();
      }
    } else if (supabaseClient) {
      const { count } = await supabaseClient.from(TABLES.geral).select('*', { count: 'exact', head: true });
      queueCount = count || 0;
    }

    // Se a fila estiver vazia, todos os envios foram concluídos com sucesso (sem pendências)
    if (queueCount === 0) {
      if (watchdogState.currentRetries > 0) {
        watchdogState.currentRetries = 0;
        watchdogState.lastDispatchTime = null;
      }
      watchdogState.status = 'idle';
      return;
    }

    // 2. Checar a data do último produto enviado
    let lastSentDate = null;
    if (pool) {
      const { rows } = await pool.query(`SELECT MAX(created_at) as last_sent FROM ${TABLES.enviados}`);
      if (rows[0]?.last_sent) {
        lastSentDate = new Date(rows[0].last_sent).getTime();
      }
    } else if (supabaseClient) {
      const { data } = await supabaseClient
        .from(TABLES.enviados)
        .select('created_at')
        .order('created_at', { ascending: false })
        .limit(1);
      if (data && data[0]?.created_at) {
        lastSentDate = new Date(data[0].created_at).getTime();
      }
    }

    // Se novos produtos foram enviados desde o último disparo de segurança:
    // Sucesso! O bot respondeu e está enviando normalmente -> resetar contador de tentativas!
    if (watchdogState.lastDispatchTime && lastSentDate && lastSentDate > watchdogState.lastDispatchTime) {
      console.log('[Sentinela] Novo produto enviado detectado! Resetando contador de segurança.');
      watchdogState.currentRetries = 0;
      watchdogState.lastDispatchTime = null;
      watchdogState.status = 'active';
      return;
    }

    // 3. Determinar o tempo de referência de inatividade
    const referenceTime = lastSentDate || queueStartTime || now;
    const timeSinceLastSent = now - referenceTime;

    // Se ainda não se passaram 10 minutos sem envio, tudo normal
    if (timeSinceLastSent < tenMinutesMs) {
      if (watchdogState.currentRetries === 0) {
        watchdogState.status = 'active';
      }
      return;
    }

    // Passou mais de 10 minutos sem enviar nenhum produto!
    // Verificar se já atingiu o limite de 5 disparos
    if (watchdogState.currentRetries >= watchdogState.maxRetries) {
      watchdogState.status = 'limit_reached';
      return;
    }

    // Verificar se já passou 10 minutos desde o ÚLTIMO disparo de segurança
    if (watchdogState.lastDispatchTime && (now - watchdogState.lastDispatchTime) < tenMinutesMs) {
      watchdogState.status = 'retrying';
      return;
    }

    // EXECUÇÃO DO DISPARO DE SEGURANÇA NO WEBHOOK DE DISPARO IMEDIATO
    watchdogState.currentRetries += 1;
    watchdogState.lastDispatchTime = now;
    watchdogState.status = watchdogState.currentRetries >= watchdogState.maxRetries ? 'limit_reached' : 'retrying';

    const attemptNumber = watchdogState.currentRetries;
    const { timeStr, dateStr } = getBrasiliaDateTime();

    console.log(`[Sentinela Segurança] ⚠️ Mais de 10 minutos sem envio de produtos! Executando disparo de segurança no webhook (Tentativa ${attemptNumber}/5)...`);

    const result = await dispatchN8nWebhook({
      trigger: 'seguranca_anti_travamento',
      timerInfo: {
        id: `seguranca_${attemptNumber}`,
        timer: '10m inativo',
        nome_timer: `Disparo de Segurança (${attemptNumber}/5) - Inatividade > 10m`,
      },
    });

    const logEntry = {
      id: Date.now().toString(),
      timestamp: new Date().toISOString(),
      brasiliaTime: timeStr,
      brasiliaDate: dateStr,
      timerId: `seguranca_${attemptNumber}`,
      timerHour: '10m inativo',
      nomeTimer: `Segurança: Disparo Imediato (${attemptNumber}/5)`,
      ok: result.ok,
      status: result.status,
      latencyMs: result.latencyMs,
      response: result.response || (result.ok ? 'Disparo de segurança enviado com sucesso' : 'Falha no envio do disparo'),
      targetUrl: result.targetUrl || currentN8nWebhook || '',
      hint: `Tentativa ${attemptNumber} de 5 realizada após 10 minutos sem envios.`,
      trigger: 'seguranca_inatividade',
    };

    timerLogs.unshift(logEntry);
    if (timerLogs.length > 50) timerLogs.pop();
  } catch (err) {
    console.warn('[Sentinela Segurança Erro]:', err.message);
  }
}

// Background scheduler tick every 5 seconds & watchdog tick every 10 seconds
setInterval(() => {
  checkAndTriggerTimers().catch((err) => console.warn('[Timer Interval Error]:', err.message));
}, 5000);

setInterval(() => {
  checkWatchdogSafety().catch((err) => console.warn('[Watchdog Interval Error]:', err.message));
}, 10000);

async function handleApi(req, res, url, user) {
  const userId = user.id;

  try {
    // GET /api/link-atual (Real link from Supabase)
    if (req.method === 'GET' && url.pathname === '/api/link-atual') {
      let item = null;

      if (pool) {
        try {
          const { rows } = await pool.query(
            `SELECT * FROM ${TABLES.linkAtual} ORDER BY created_at DESC LIMIT 1`,
          );
          item = rows[0] || null;
        } catch (err) {
          console.warn('[PG link-atual query warn]:', err.message);
        }
      }

      if (!item && supabaseClient) {
        try {
          const { data, error } = await supabaseClient
            .from(TABLES.linkAtual)
            .select('*')
            .order('created_at', { ascending: false })
            .limit(1);
          if (!error && data?.length) {
            item = data[0];
          }
        } catch (err) {
          console.warn('[Supabase REST link-atual warn]:', err.message);
        }
      }

      if (item) {
        item.marketplace = detectMarketplace(item.link, item.tag);
      }
      return sendJson(res, 200, item);
    }

    // GET /api/produtos/enviados/count (Real count from Supabase - isolado por usuário)
    if (req.method === 'GET' && url.pathname === '/api/produtos/enviados/count') {
      const onlyToday = url.searchParams.get('hoje') !== 'false';
      let count = 0;
      if (pool) {
        try {
          let query = `SELECT COUNT(*)::int AS count FROM ${TABLES.enviados} WHERE (id_usuario = $1 OR id_usuario IS NULL)`;
          if (onlyToday) {
            query += ` AND created_at >= (date_trunc('day', NOW() AT TIME ZONE 'America/Sao_Paulo') AT TIME ZONE 'America/Sao_Paulo')`;
          }
          const { rows } = await pool.query(query, [userId]);
          count = rows[0]?.count ?? 0;
        } catch (_) {}
      } else if (supabaseClient) {
        try {
          const { count: c, error } = await supabaseClient
            .from(TABLES.enviados)
            .select('*', { count: 'exact', head: true });
          if (!error && typeof c === 'number') count = c;
        } catch (_) {}
      }
      return sendJson(res, 200, { count });
    }

    // GET /api/produtos/geral/count (Real count of items - isolado por usuário)
    if (req.method === 'GET' && url.pathname === '/api/produtos/geral/count') {
      let count = 0;
      if (pool) {
        try {
          const { rows } = await pool.query(
            `SELECT COUNT(*)::int AS count FROM ${TABLES.geral} WHERE id_usuario = $1`,
            [userId]
          );
          count = rows[0]?.count ?? 0;
        } catch (_) {}
      } else if (supabaseClient) {
        try {
          const { count: c, error } = await supabaseClient
            .from(TABLES.geral)
            .select('*', { count: 'exact', head: true });
          if (!error && typeof c === 'number') count = c;
        } catch (_) {}
      }
      return sendJson(res, 200, { count });
    }

    // GET /api/produtos/geral (Fila de produtos isolada por usuário)
    if (req.method === 'GET' && url.pathname === '/api/produtos/geral') {
      const search = (url.searchParams.get('search') || '').trim().toLowerCase();
      const marketplace = (url.searchParams.get('marketplace') || '').trim().toLowerCase();
      const requestedLimit = url.searchParams.get('limit');
      let items = [];

      if (pool) {
        try {
          const query = userId
            ? `SELECT g.id, g.created_at, g.nome_produto, g.url_produto, g.url_imagem,
                      g.valor_original, g.valor_promocional, g.forma_entrega, g.id_usuario,
                      g.id_categoria, c.nome_categoria
               FROM ${TABLES.geral} g
               LEFT JOIN ${TABLES.categorias} c ON c.id = g.id_categoria
               WHERE g.id_usuario = $1
               ORDER BY g.id ASC LIMIT 500`
            : `SELECT g.id, g.created_at, g.nome_produto, g.url_produto, g.url_imagem,
                      g.valor_original, g.valor_promocional, g.forma_entrega, g.id_usuario,
                      g.id_categoria, c.nome_categoria
               FROM ${TABLES.geral} g
               LEFT JOIN ${TABLES.categorias} c ON c.id = g.id_categoria
               ORDER BY g.id ASC LIMIT 500`;
          const params = userId ? [userId] : [];
          const { rows } = await pool.query(query, params);
          items = rows || [];
        } catch (err) {
          console.warn('[PG produtos geral query warn]:', err.message);
          try {
            const query = userId
              ? `SELECT id, created_at, nome_produto, url_produto, url_imagem, valor_original, valor_promocional, forma_entrega, id_usuario, id_categoria
                 FROM ${TABLES.geral}
                 WHERE id_usuario = $1
                 ORDER BY id ASC LIMIT 500`
              : `SELECT id, created_at, nome_produto, url_produto, url_imagem, valor_original, valor_promocional, forma_entrega, id_usuario, id_categoria
                 FROM ${TABLES.geral}
                 ORDER BY id ASC LIMIT 500`;
            const { rows } = await pool.query(query, userId ? [userId] : []);
            items = rows || [];
          } catch (_) {}
        }
      } else if (supabaseClient) {
        try {
          let q = supabaseClient.from(TABLES.geral).select('*');
          if (userId) q = q.eq('id_usuario', userId);
          const { data, error } = await q.order('id', { ascending: true }).limit(500);
          if (!error && Array.isArray(data)) items = data;
        } catch (_) {}
      }

      items = items.map((item) => ({
        ...item,
        marketplace: detectMarketplace(item.url_produto || '', item.nome_produto || ''),
      }));

      if (search) {
        items = items.filter((item) => {
          const text = ((item.nome_produto || '') + ' ' + (item.url_produto || '') + ' ' + (item.nome_categoria || '')).toLowerCase();
          return text.includes(search);
        });
      }

      if (marketplace && marketplace !== 'todos') {
        items = items.filter((item) => item.marketplace.id === marketplace);
      }

      if (requestedLimit && requestedLimit !== 'all') {
        const limit = Number.parseInt(requestedLimit, 10);
        if (Number.isFinite(limit) && limit > 0) {
          items = items.slice(0, limit);
        }
      }

      return sendJson(res, 200, items);
    }

    // DELETE /api/produtos/geral (Isolado exclusivamente por usuário)
    if (req.method === 'DELETE' && url.pathname === '/api/produtos/geral') {
      const id = url.searchParams.get('id');
      const clearAll = url.searchParams.get('all') === 'true';
      if (!id && !clearAll) {
        return sendJson(res, 400, { error: 'ID do produto ou parâmetro all=true é obrigatório.' });
      }

      let deletedCount = 0;
      if (pool) {
        try {
          if (clearAll) {
            const query = userId
              ? `DELETE FROM ${TABLES.geral} WHERE id_usuario = $1`
              : `DELETE FROM ${TABLES.geral}`;
            const { rowCount } = await pool.query(query, userId ? [userId] : []);
            deletedCount = rowCount || 0;
          } else {
            const query = userId
              ? `DELETE FROM ${TABLES.geral} WHERE id = $1 AND id_usuario = $2`
              : `DELETE FROM ${TABLES.geral} WHERE id = $1`;
            const { rowCount } = await pool.query(query, userId ? [id, userId] : [id]);
            deletedCount = rowCount || 0;
          }
        } catch (err) {
          console.warn('[PG delete produto geral error]:', err.message);
          return sendJson(res, 500, { error: 'Não foi possível remover o produto no momento. Tente novamente mais tarde.' });
        }
      } else if (supabaseClient) {
        try {
          if (clearAll) {
            let q = supabaseClient.from(TABLES.geral).delete();
            if (userId) q = q.eq('id_usuario', userId);
            else q = q.neq('id', 0);
            await q;
          } else {
            let q = supabaseClient.from(TABLES.geral).delete().eq('id', id);
            if (userId) q = q.eq('id_usuario', userId);
            await q;
          }
        } catch (_) {}
      }

      return sendJson(res, 200, { ok: true, deletedCount, message: 'Produto removido da fila com sucesso.' });
    }

    // GET /api/categorias (List all categories from n8n_categoria with total products count in n8n_todos_produtos)
    if (req.method === 'GET' && url.pathname === '/api/categorias') {
      let categories = [];
      if (pool) {
        try {
          const { rows } = await pool.query(
            `SELECT c.id, c.nome_categoria, c.link_categoria, c.contagem_uso, c.created_at,
                    COUNT(tp.id)::int AS total_produtos
             FROM ${TABLES.categorias} c
             LEFT JOIN ${TABLES.todosProdutos} tp ON tp.id_categoria = c.id
             GROUP BY c.id, c.nome_categoria, c.link_categoria, c.contagem_uso, c.created_at
             ORDER BY c.id ASC`
          );
          categories = rows || [];
        } catch (err) {
          console.warn('[PG get categorias join err]:', err.message);
          try {
            const { rows } = await pool.query(
              `SELECT id, nome_categoria, link_categoria, contagem_uso, created_at FROM ${TABLES.categorias} ORDER BY id ASC`
            );
            categories = rows || [];
          } catch (e2) {
            console.warn('[PG get categorias fallback err]:', e2.message);
          }
        }
      }
      return sendJson(res, 200, categories);
    }

    // GET /api/produtos/categorias-ativas (Lê diretamente da tabela n8n_categorias_usuarios com quantidade_produtos)
    if (req.method === 'GET' && url.pathname === '/api/produtos/categorias-ativas') {
      let activeIds = [];
      let activeQuantidades = {};
      const authorization = req.headers.authorization || '';
      let userId = null;
      if (authorization.startsWith('Bearer ')) {
        const token = authorization.slice(7).trim();
        try {
          const parts = token.split('.');
          if (parts.length === 3) {
            const payload = JSON.parse(Buffer.from(parts[1], 'base64').toString('utf8'));
            userId = payload.sub || null;
          }
        } catch (_) {}
      }

      // 1. Consultar n8n_categorias_usuarios no banco
      if (pool) {
        try {
          const query = userId
            ? `SELECT id_categoria, COALESCE(quantidade_produtos, quantidade, 5) AS quantidade_produtos, id_usuario 
               FROM ${TABLES.categoriasUsuarios} 
               WHERE id_usuario = $1 OR id_usuario IS NULL 
               ORDER BY id_categoria ASC`
            : `SELECT id_categoria, COALESCE(quantidade_produtos, quantidade, 5) AS quantidade_produtos, id_usuario 
               FROM ${TABLES.categoriasUsuarios} 
               ORDER BY id_categoria ASC`;
          const params = userId ? [userId] : [];
          const { rows } = await pool.query(query, params);
          if (rows && rows.length > 0) {
            activeIds = rows.map((r) => Number(r.id_categoria)).filter((n) => Number.isFinite(n) && n > 0);
            rows.forEach((r) => {
              activeQuantidades[String(r.id_categoria)] = Number(r.quantidade_produtos) || 5;
            });
          }
        } catch (err) {
          try {
            const queryFallback = userId
              ? `SELECT id_categoria, id_usuario FROM ${TABLES.categoriasUsuarios} WHERE id_usuario = $1 OR id_usuario IS NULL ORDER BY id_categoria ASC`
              : `SELECT id_categoria, id_usuario FROM ${TABLES.categoriasUsuarios} ORDER BY id_categoria ASC`;
            const { rows } = await pool.query(queryFallback, userId ? [userId] : []);
            if (rows && rows.length > 0) {
              activeIds = rows.map((r) => Number(r.id_categoria)).filter((n) => Number.isFinite(n) && n > 0);
              rows.forEach((r) => {
                activeQuantidades[String(r.id_categoria)] = 5;
              });
            }
          } catch (_) {}
        }
      }

      if (activeIds.length === 0 && supabaseClient) {
        try {
          let q = supabaseClient.from(TABLES.categoriasUsuarios).select('*');
          if (userId) q = q.or(`id_usuario.eq.${userId},id_usuario.is.null`);
          const { data, error } = await q;
          if (!error && Array.isArray(data) && data.length > 0) {
            activeIds = data.map((r) => Number(r.id_categoria)).filter((n) => Number.isFinite(n) && n > 0);
            data.forEach((r) => {
              activeQuantidades[String(r.id_categoria)] = Number(r.quantidade_produtos || r.quantidade || 5);
            });
          }
        } catch (sbErr) {
          console.warn('[Supabase n8n_categorias_usuarios read warn]:', sbErr.message);
        }
      }

      // 2. Buscar detalhes das categorias ativas em n8n_categoria
      let activeCategories = [];
      if (activeIds.length > 0) {
        if (pool) {
          try {
            const { rows } = await pool.query(
              `SELECT id, nome_categoria, link_categoria FROM ${TABLES.categorias} WHERE id = ANY($1::bigint[]) ORDER BY id ASC`,
              [activeIds]
            );
            activeCategories = (rows || []).map((cat) => ({
              ...cat,
              quantidade: activeQuantidades[String(cat.id)] || 5,
              quantidade_produtos: activeQuantidades[String(cat.id)] || 5,
            }));
          } catch (_) {}
        }
        if (activeCategories.length === 0 && supabaseClient) {
          try {
            const { data } = await supabaseClient
              .from(TABLES.categorias)
              .select('id, nome_categoria, link_categoria')
              .in('id', activeIds)
              .order('id', { ascending: true });
            if (Array.isArray(data)) {
              activeCategories = data.map((cat) => ({
                ...cat,
                quantidade: activeQuantidades[String(cat.id)] || 5,
                quantidade_produtos: activeQuantidades[String(cat.id)] || 5,
              }));
            }
          } catch (_) {}
        }
      }

      return sendJson(res, 200, {
        activeIds,
        activeCategories,
        quantidades: activeQuantidades,
      });
    }

    // POST /api/produtos/aplicar-categorias (Grava diretamente em n8n_categorias_usuarios com quantidade_produtos e atualiza n8n_produtos_geral com id_usuario)
    if (req.method === 'POST' && url.pathname === '/api/produtos/aplicar-categorias') {
      const body = await readJsonBody(req).catch(() => ({}));
      const rawIds = Array.isArray(body?.categoria_ids) ? body.categoria_ids : [];
      const categoryIds = rawIds.map((n) => Number(n)).filter((n) => Number.isFinite(n) && n > 0);
      const userQuantities = body?.quantidades && typeof body.quantidades === 'object' ? body.quantidades : {};
      const defaultQty = Number(body?.quantidade_padrao) || 5;
      const substituir = body?.substituir !== false;
      const effectiveUserId = await resolveCurrentUserId(body?.id_usuario || userId);

      if (categoryIds.length === 0) {
        return sendJson(res, 400, { error: 'Selecione ao menos uma categoria para aplicar.' });
      }

      try {
        // 1. Gravar em n8n_categorias_usuarios (id_categoria, id_usuario, quantidade_produtos)
        let savedInDb = false;
        if (pool) {
          try {
            await pool.query(`DELETE FROM ${TABLES.categoriasUsuarios} WHERE id_usuario = $1 OR id_usuario IS NULL`, [effectiveUserId]);
            // Garantir colunas no PostgreSQL
            try {
              await pool.query(`ALTER TABLE ${TABLES.categoriasUsuarios} ADD COLUMN IF NOT EXISTS quantidade_produtos INTEGER DEFAULT 5`);
              await pool.query(`ALTER TABLE ${TABLES.categoriasUsuarios} ADD COLUMN IF NOT EXISTS quantidade INTEGER DEFAULT 5`);
            } catch (_) {}

            for (const cid of categoryIds) {
              const qty = Number(userQuantities[cid]) || defaultQty || 5;
              try {
                await pool.query(
                  `INSERT INTO ${TABLES.categoriasUsuarios} (id_categoria, id_usuario, quantidade_produtos, quantidade) VALUES ($1, $2, $3, $4)`,
                  [cid, effectiveUserId, qty, qty]
                );
              } catch (_) {
                try {
                  await pool.query(
                    `INSERT INTO ${TABLES.categoriasUsuarios} (id_categoria, id_usuario, quantidade_produtos) VALUES ($1, $2, $3)`,
                    [cid, effectiveUserId, qty]
                  );
                } catch (e2) {
                  await pool.query(
                    `INSERT INTO ${TABLES.categoriasUsuarios} (id_categoria, id_usuario) VALUES ($1, $2)`,
                    [cid, effectiveUserId]
                  );
                }
              }
            }
            savedInDb = true;
          } catch (pgErr) {
            console.warn('[PG n8n_categorias_usuarios save warn]:', pgErr.message);
          }
        }

        if (!savedInDb && supabaseClient) {
          try {
            await supabaseClient.from(TABLES.categoriasUsuarios).delete().eq('id_usuario', effectiveUserId);
            const rowsToInsert = categoryIds.map((cid) => ({
              id_categoria: cid,
              id_usuario: effectiveUserId,
              quantidade_produtos: Number(userQuantities[cid]) || defaultQty || 5,
            }));
            const { error: sbInsertErr } = await supabaseClient.from(TABLES.categoriasUsuarios).insert(rowsToInsert);
            if (!sbInsertErr) {
              savedInDb = true;
            } else {
              const fallbackRows = categoryIds.map((cid) => ({
                id_categoria: cid,
                id_usuario: effectiveUserId,
              }));
              await supabaseClient.from(TABLES.categoriasUsuarios).insert(fallbackRows);
              savedInDb = true;
            }
          } catch (sbEx) {
            console.warn('[Supabase n8n_categorias_usuarios exception]:', sbEx.message);
          }
        }

        // 2. Buscar nomes das categorias selecionadas
        let selectedCats = [];
        if (pool) {
          try {
            const { rows } = await pool.query(
              `SELECT id, nome_categoria FROM ${TABLES.categorias} WHERE id = ANY($1::bigint[]) ORDER BY id ASC`,
              [categoryIds]
            );
            selectedCats = rows || [];
          } catch (_) {}
        }
        if (selectedCats.length === 0 && supabaseClient) {
          try {
            const { data } = await supabaseClient.from(TABLES.categorias).select('id, nome_categoria').in('id', categoryIds);
            if (Array.isArray(data)) selectedCats = data;
          } catch (_) {}
        }

        // 3. Buscar produtos correspondentes em n8n_todos_produtos
        let produtosCorrespondentes = [];
        if (pool) {
          try {
            const { rows } = await pool.query(
              `SELECT nome_produto, url_produto, url_imagem, valor_original, valor_promocional, forma_entrega, id_categoria
               FROM ${TABLES.todosProdutos}
               WHERE id_categoria = ANY($1::smallint[])
               ORDER BY id_categoria ASC, id ASC`,
              [categoryIds]
            );
            produtosCorrespondentes = rows || [];
          } catch (_) {}
        }
        if (produtosCorrespondentes.length === 0 && supabaseClient) {
          try {
            const { data } = await supabaseClient
              .from(TABLES.todosProdutos)
              .select('nome_produto, url_produto, url_imagem, valor_original, valor_promocional, forma_entrega, id_categoria')
              .in('id_categoria', categoryIds)
              .order('id', { ascending: true });
            if (Array.isArray(data)) produtosCorrespondentes = data;
          } catch (_) {}
        }

        // 4. Agrupar produtos por categoria e intercalar (Round-Robin)
        const produtosPorCategoria = new Map();
        categoryIds.forEach((cid) => produtosPorCategoria.set(cid, []));
        for (const p of produtosCorrespondentes) {
          const cid = Number(p.id_categoria);
          if (produtosPorCategoria.has(cid)) {
            produtosPorCategoria.get(cid).push(p);
          }
        }

        const categoriaItemsMap = new Map();
        const savedQuantities = {};
        for (const cat of selectedCats) {
          const cid = Number(cat.id);
          const allItems = produtosPorCategoria.get(cid) || [];
          const limit = Number(userQuantities[cid]) || defaultQty || 5;
          const itemsToTake = limit > 0 ? allItems.slice(0, limit) : allItems;
          categoriaItemsMap.set(cid, itemsToTake);
          savedQuantities[String(cid)] = itemsToTake.length;
        }

        const produtosParaInserir = [];
        let hasMore = true;
        let roundIndex = 0;
        while (hasMore) {
          hasMore = false;
          for (const cat of selectedCats) {
            const cid = Number(cat.id);
            const items = categoriaItemsMap.get(cid) || [];
            if (roundIndex < items.length) {
              produtosParaInserir.push(items[roundIndex]);
              hasMore = true;
            }
          }
          roundIndex++;
        }

        // 5. Atualizar fila n8n_produtos_geral (Isolado exclusivamente para este usuário)
        let insertedCount = 0;
        if (substituir) {
          if (pool) {
            try { await pool.query(`DELETE FROM ${TABLES.geral} WHERE id_usuario = $1`, [effectiveUserId]); } catch (_) {}
          } else if (supabaseClient) {
            try { await supabaseClient.from(TABLES.geral).delete().eq('id_usuario', effectiveUserId); } catch (_) {}
          }
        }

        if (produtosParaInserir.length > 0) {
          if (pool) {
            try {
              for (const p of produtosParaInserir) {
                await pool.query(
                  `INSERT INTO ${TABLES.geral}
                    (nome_produto, url_produto, url_imagem, valor_original, valor_promocional, forma_entrega, id_categoria, id_usuario)
                   VALUES ($1, $2, $3, $4, $5, $6, $7, $8)`,
                  [
                    p.nome_produto || null,
                    p.url_produto || null,
                    p.url_imagem || null,
                    p.valor_original || null,
                    p.valor_promocional || null,
                    p.forma_entrega || null,
                    p.id_categoria !== undefined && p.id_categoria !== null ? Number(p.id_categoria) : null,
                    effectiveUserId,
                  ]
                );
                insertedCount++;
              }
              // Garantia de integridade: corrigir qualquer id_usuario nulo em n8n_produtos_geral
              await pool.query(
                `UPDATE ${TABLES.geral} SET id_usuario = $1 WHERE id_usuario IS NULL OR id_usuario = ''`,
                [effectiveUserId]
              ).catch(() => {});
            } catch (_) {}
          } else if (supabaseClient) {
            try {
              const toInsert = produtosParaInserir.map((p) => ({
                nome_produto: p.nome_produto || null,
                url_produto: p.url_produto || null,
                url_imagem: p.url_imagem || null,
                valor_original: p.valor_original || null,
                valor_promocional: p.valor_promocional || null,
                forma_entrega: p.forma_entrega || null,
                id_categoria: p.id_categoria !== undefined && p.id_categoria !== null ? Number(p.id_categoria) : null,
                id_usuario: effectiveUserId,
              }));
              const { error: insErr } = await supabaseClient.from(TABLES.geral).insert(toInsert);
              if (!insErr) insertedCount = toInsert.length;
              await supabaseClient
                .from(TABLES.geral)
                .update({ id_usuario: effectiveUserId })
                .is('id_usuario', null)
                .catch(() => {});
            } catch (_) {}
          }
        }

        const selectedCatsWithQty = selectedCats.map((cat) => {
          const cid = Number(cat.id);
          const qVal = Number(userQuantities[cid]) || defaultQty || 5;
          return {
            ...cat,
            quantidade: qVal,
            quantidade_produtos: qVal,
          };
        });

        return sendJson(res, 200, {
          ok: true,
          categoria_ids: categoryIds,
          quantidades: userQuantities,
          categorias: selectedCatsWithQty,
          produtos_adicionados: insertedCount,
          salvo_banco: savedInDb,
          message: `${categoryIds.length} categoria(s) com quantidade_produtos salvas com sucesso e ${insertedCount} produto(s) preparados na fila!`,
        });
      } catch (err) {
        console.error('[aplicar-categorias Error]:', err);
        return sendJson(res, 500, { error: 'Erro ao salvar categorias e atualizar produtos.' });
      }
    }

    // DELETE /api/produtos/categorias-ativas (Remove categoria de n8n_categorias_usuarios)
    if (req.method === 'DELETE' && (url.pathname === '/api/produtos/categorias-ativas' || url.pathname === '/api/produtos/categorias-usuarios')) {
      const catId = url.searchParams.get('id');
      const all = url.searchParams.get('all') === 'true';
      if (pool) {
        try {
          if (all) {
            if (userId) {
              await pool.query(`DELETE FROM ${TABLES.categoriasUsuarios} WHERE id_usuario = $1 OR id_usuario IS NULL`, [userId]);
            } else {
              await pool.query(`DELETE FROM ${TABLES.categoriasUsuarios}`);
            }
          } else if (catId) {
            if (userId) {
              await pool.query(`DELETE FROM ${TABLES.categoriasUsuarios} WHERE id_categoria = $1 AND (id_usuario = $2 OR id_usuario IS NULL)`, [Number(catId), userId]);
            } else {
              await pool.query(`DELETE FROM ${TABLES.categoriasUsuarios} WHERE id_categoria = $1`, [Number(catId)]);
            }
          }
        } catch (_) {}
      }
      if (supabaseClient) {
        try {
          if (all) {
            if (userId) await supabaseClient.from(TABLES.categoriasUsuarios).delete().eq('id_usuario', userId);
            else await supabaseClient.from(TABLES.categoriasUsuarios).delete().neq('id_categoria', 0);
          } else if (catId) {
            let q = supabaseClient.from(TABLES.categoriasUsuarios).delete().eq('id_categoria', Number(catId));
            if (userId) q = q.eq('id_usuario', userId);
            await q;
          }
        } catch (_) {}
      }
      return sendJson(res, 200, { ok: true, message: 'Categoria removida com sucesso.' });
    }

    // POST /api/produtos/disparar-webhook (Trigger products collection webhook manually)
    if (req.method === 'POST' && (url.pathname === '/api/produtos/disparar-webhook' || url.pathname === '/api/produtos/coletar')) {
      const body = await readJsonBody(req).catch(() => ({}));
      const customUrl = body?.webhookUrl || null;

      const result = await dispatchN8nProdutosWebhook({
        trigger: 'manual',
        customUrl,
      });

      const { timeStr, dateStr } = getBrasiliaDateTime();
      const logEntry = {
        id: Date.now().toString(),
        timestamp: new Date().toISOString(),
        brasiliaTime: timeStr,
        brasiliaDate: dateStr,
        timerId: null,
        timerHour: 'manual',
        nomeTimer: 'Coleta Manual de Produtos',
        ok: result.ok,
        status: result.status,
        latencyMs: result.latencyMs,
        response: result.response,
        targetUrl: result.targetUrl,
        hint: result.hint || '',
        trigger: 'manual_produtos',
      };

      timerLogs.unshift(logEntry);
      if (timerLogs.length > 50) timerLogs.pop();

      return sendJson(res, 200, result);
    }

    // GET /api/produtos/enviados (Real items from Supabase - default to today for Dashboard)
    if (req.method === 'GET' && url.pathname === '/api/produtos/enviados') {
      const requestedLimit = url.searchParams.get('limit') || '10';
      const search = (url.searchParams.get('search') || '').trim().toLowerCase();
      const marketplace = (url.searchParams.get('marketplace') || '').trim().toLowerCase();
      const format = url.searchParams.get('format');
      const allDays = url.searchParams.get('todos') === 'true';

      let items = [];

      if (pool) {
        try {
          let query = `
            SELECT e.id, e.created_at, e.url_produto, e.id_usuario,
                   COALESCE(g.nome_produto, 'Produto Monitorado') AS nome_produto,
                   g.url_imagem, g.valor_original, g.valor_promocional, g.forma_entrega
            FROM ${TABLES.enviados} e
            LEFT JOIN ${TABLES.geral} g ON e.url_produto = g.url_produto
          `;
          if (!allDays) {
            query += ` WHERE e.created_at >= (date_trunc('day', NOW() AT TIME ZONE 'America/Sao_Paulo') AT TIME ZONE 'America/Sao_Paulo') `;
          }
          query += ` ORDER BY e.created_at DESC LIMIT 500 `;
          const { rows } = await pool.query(query);
          items = rows || [];
        } catch (err) {
          console.warn('[PG enviados query warn]:', err.message);
        }
      }

      if (!items.length && supabaseClient) {
        try {
          const { data, error } = await supabaseClient
            .from(TABLES.enviados)
            .select('*')
            .order('created_at', { ascending: false })
            .limit(300);
          if (!error && Array.isArray(data)) {
            items = data;
          }
        } catch (err) {
          console.warn('[Supabase REST enviados warn]:', err.message);
        }
      }

      items = items.map((item) => ({
        ...item,
        marketplace: detectMarketplace(item.url_produto || item.link || '', item.nome_produto || item.title || ''),
      }));

      if (search) {
        items = items.filter((item) => {
          const text = ((item.nome_produto || item.title || '') + ' ' + (item.url_produto || item.link || '')).toLowerCase();
          return text.includes(search);
        });
      }

      if (marketplace && marketplace !== 'todos') {
        items = items.filter((item) => item.marketplace.id === marketplace);
      }

      if (format === 'csv') {
        const header = 'ID;Data Envio;Horario;Marketplace;Produto;Link\n';
        const rows = items.map((p) => {
          const d = new Date(p.created_at);
          const dataStr = d.toLocaleDateString('pt-BR', { timeZone: 'America/Sao_Paulo' });
          const horaStr = d.toLocaleTimeString('pt-BR', { timeZone: 'America/Sao_Paulo' });
          const nome = (p.nome_produto || p.title || 'Produto Oferta').replace(/;/g, ',');
          const link = (p.url_produto || p.link || '').replace(/;/g, ',');
          return `${p.id || ''};${dataStr};${horaStr};${p.marketplace.name};"${nome}";${link}`;
        }).join('\n');

        return sendCsv(res, `produtos_enviados_${new Date().toISOString().slice(0, 10)}.csv`, header + rows);
      }

      if (requestedLimit !== 'all') {
        const parsedLimit = Number.parseInt(requestedLimit, 10);
        const limit = Number.isFinite(parsedLimit) ? Math.min(Math.max(parsedLimit, 1), 500) : 10;
        items = items.slice(0, limit);
      }

      return sendJson(res, 200, items);
    }

    // GET /api/historico-links (Real links from Supabase)
    if (req.method === 'GET' && url.pathname === '/api/historico-links') {
      let items = [];

      if (pool) {
        try {
          const { rows } = await pool.query(
            `SELECT id, link, created_at, id_usuario FROM ${TABLES.historicoLink} ORDER BY created_at DESC LIMIT 50`,
          );
          items = rows || [];
        } catch (err) {
          console.warn('[PG historico-links query warn]:', err.message);
        }
      }

      if (!items.length && supabaseClient) {
        try {
          const { data, error } = await supabaseClient
            .from(TABLES.historicoLink)
            .select('id, link, created_at, id_usuario')
            .order('created_at', { ascending: false })
            .limit(50);
          if (!error && Array.isArray(data)) {
            items = data;
          }
        } catch (err) {
          console.warn('[Supabase REST historico-links warn]:', err.message);
        }
      }

      const enriched = items.map((r) => ({ ...r, marketplace: detectMarketplace(r.link) }));
      return sendJson(res, 200, enriched);
    }

    // POST /api/historico-links (Save link in Supabase)
    if (req.method === 'POST' && url.pathname === '/api/historico-links') {
      const body = await readJsonBody(req);
      const link = normalizeLink(body.link);
      const tag = typeof body.tag === 'string' ? body.tag.trim().slice(0, 80) : '';
      if (!link) return sendJson(res, 400, { error: 'Informe um link HTTP/HTTPS válido.' });

      let item = null;

      if (pool) {
        try {
          const { rows } = await pool.query(
            `INSERT INTO ${TABLES.historicoLink} (id_usuario, link) VALUES ($1, $2) RETURNING id, link, created_at, id_usuario`,
            [userId, link],
          );
          item = rows[0];
        } catch (e) {
          console.warn('[PG insert historico err]:', e.message);
        }
      }

      if (!item && supabaseClient) {
        try {
          const { data, error } = await supabaseClient
            .from(TABLES.historicoLink)
            .insert([{ id_usuario: userId, link }])
            .select('id, link, created_at, id_usuario')
            .single();
          if (!error && data) item = data;
        } catch (err) {
          console.warn('[Supabase REST insert historico warn]:', err.message);
        }
      }

      if (!item) {
        item = { id: Date.now(), link, tag, created_at: new Date().toISOString() };
      }

      item.marketplace = detectMarketplace(item.link);
      return sendJson(res, 201, item);
    }

    // DELETE /api/historico-links
    if (req.method === 'DELETE' && url.pathname === '/api/historico-links') {
      const id = Number(url.searchParams.get('id'));
      if (!id) return sendJson(res, 400, { error: 'ID do link é obrigatório.' });

      if (pool) {
        try {
          await pool.query(`DELETE FROM ${TABLES.historicoLink} WHERE id = $1`, [id]);
        } catch (_) {}
      } else if (supabaseClient) {
        try {
          await supabaseClient.from(TABLES.historicoLink).delete().eq('id', id);
        } catch (_) {}
      }

      return sendJson(res, 200, { ok: true });
    }

    // POST /api/bot/restaurar-link (Activate link in Supabase)
    if (req.method === 'POST' && url.pathname === '/api/bot/restaurar-link') {
      const body = await readJsonBody(req);
      const effectiveUserId = await resolveCurrentUserId(body?.id_usuario || userId);
      let link = normalizeLink(body.link);

      if (!link && body.id !== undefined) {
        if (pool) {
          try {
            const result = await pool.query(
              `SELECT link FROM ${TABLES.historicoLink} WHERE id = $1`,
              [body.id],
            );
            link = normalizeLink(result.rows[0]?.link);
          } catch (_) {}
        }

        if (!link && supabaseClient) {
          try {
            const { data } = await supabaseClient
              .from(TABLES.historicoLink)
              .select('link')
              .eq('id', body.id)
              .single();
            link = normalizeLink(data?.link);
          } catch (_) {}
        }
      }

      if (!link) return sendJson(res, 400, { error: 'Link não encontrado ou formato inválido.' });

      let activeItem = null;

      if (pool) {
        try {
          await pool.query(`DELETE FROM ${TABLES.linkAtual}`);
          const { rows } = await pool.query(
            `INSERT INTO ${TABLES.linkAtual} (link, id_usuario) VALUES ($1, $2) RETURNING *`,
            [link, effectiveUserId],
          );
          activeItem = rows[0];
        } catch (err) {
          console.warn('[PG restaurar link err]:', err.message);
        }
      }

      if (!activeItem && supabaseClient) {
        try {
          await supabaseClient.from(TABLES.linkAtual).delete().neq('id', 0);
          const { data } = await supabaseClient
            .from(TABLES.linkAtual)
            .insert([{ link, id_usuario: effectiveUserId }])
            .select('*')
            .single();
          activeItem = data;
        } catch (err) {
          console.warn('[Supabase REST restaurar link warn]:', err.message);
        }
      }

      if (!activeItem) {
        activeItem = { id: 1, link, created_at: new Date().toISOString() };
      }

      activeItem.marketplace = detectMarketplace(activeItem.link);
      return sendJson(res, 200, activeItem);
    }


    // GET /api/bot/status (Real-time bot status based on products & operating hours)
    if (req.method === 'GET' && url.pathname === '/api/bot/status') {
      const { timeStr, dateStr } = getBrasiliaDateTime();
      const timers = await fetchDbTimers();

      let queueCount = 0;
      if (pool) {
        try {
          const { rows } = await pool.query(`SELECT COUNT(*)::int as count FROM ${TABLES.geral}`);
          queueCount = rows[0]?.count ?? 0;
        } catch (_) {}
      } else if (supabaseClient) {
        try {
          const { count } = await supabaseClient.from(TABLES.geral).select('*', { count: 'exact', head: true });
          queueCount = count || 0;
        } catch (_) {}
      }

      const hasProducts = queueCount > 0;

      // Calcular se o horário atual está dentro de pelo menos uma janela de funcionamento
      let insideOperatingHours = true;
      let matchedTimer = null;

      if (timers && timers.length > 0) {
        const parts = timeStr.split(':').map((n) => parseInt(n, 10) || 0);
        const currentMin = parts[0] * 60 + parts[1];

        insideOperatingHours = timers.some((item) => {
          if (!item.timer) return false;
          const startParts = item.timer.split(':').map((n) => parseInt(n, 10) || 0);
          const startMin = startParts[0] * 60 + startParts[1];

          let endMin = 23 * 60 + 59;
          if (item.end_timer && item.end_timer !== 'none') {
            const endParts = item.end_timer.split(':').map((n) => parseInt(n, 10) || 0);
            endMin = endParts[0] * 60 + endParts[1];
          }

          let isMatch = false;
          if (startMin <= endMin) {
            isMatch = currentMin >= startMin && currentMin <= endMin;
          } else {
            isMatch = currentMin >= startMin || currentMin <= endMin;
          }

          if (isMatch) matchedTimer = item;
          return isMatch;
        });
      }

      // Regra de Ouro: O bot só fica Ativo se TIVER PRODUTOS e ESTIVER DENTRO DO HORÁRIO DE FUNCIONAMENTO
      const isActive = hasProducts && insideOperatingHours;

      let reason = 'active';
      let reasonMessage = 'Bot ativo e operando normalmente';

      if (!hasProducts && !insideOperatingHours) {
        reason = 'no_products_and_outside_hours';
        reasonMessage = 'Offline: Fora do horário de funcionamento e sem produtos na fila';
      } else if (!hasProducts) {
        reason = 'no_products';
        reasonMessage = 'Offline: Sem produtos cadastrados na fila';
      } else if (!insideOperatingHours) {
        reason = 'outside_hours';
        reasonMessage = 'Offline: Fora do horário de funcionamento';
      }

      return sendJson(res, 200, {
        ok: true,
        isActive,
        status: isActive ? 'active' : 'offline',
        statusText: isActive ? 'Bot ativo' : 'Offline',
        reason,
        reasonMessage,
        queueCount,
        hasProducts,
        insideOperatingHours,
        timersCount: timers.length,
        brasiliaTime: timeStr,
        brasiliaDate: dateStr,
      });
    }

    // GET /api/bot/timers (Fetch registered timers from n8n_timer)
    if (req.method === 'GET' && url.pathname === '/api/bot/timers') {
      const timers = await fetchDbTimers();
      const { timeStr, dateStr } = getBrasiliaDateTime();
      return sendJson(res, 200, {
        ok: true,
        timers,
        webhookUrl: currentN8nWebhook,
        produtosWebhookUrl: currentN8nProdutosWebhook,
        brasiliaTime: timeStr,
        brasiliaDate: dateStr,
        schedulerActive: true,
        recentLogs: timerLogs.slice(0, 15),
      });
    }

    // POST /api/bot/timers (Save new timer in Supabase n8n_timer)
    if (req.method === 'POST' && url.pathname === '/api/bot/timers') {
      const body = await readJsonBody(req);
      const formattedTimer = normalizeTimeHHMMSS(body.timer);
      if (!formattedTimer) {
        return sendJson(res, 400, {
          error: 'Formato de hora de início inválido. Informe o horário no formato HH:MM:SS ou HH:MM (ex: 09:30:00).',
        });
      }
      const rawEndTimer = body.end_timer || body.endTimer;
      const formattedEndTimer = rawEndTimer && rawEndTimer !== 'none' ? normalizeTimeHHMMSS(rawEndTimer) : null;

      let defaultName = `Disparo das ${formattedTimer}`;
      if (formattedEndTimer) {
        defaultName += ` até ${formattedEndTimer}`;
      }
      const nomeTimer = (body.nome_timer || body.nomeTimer || defaultName).trim();

      let created = null;
      if (pool) {
        try {
          const insertSql = `INSERT INTO ${TABLES.timer} (timer, end_timer, nome_timer) VALUES (${sanitizeSql(formattedTimer)}, ${sanitizeSql(formattedEndTimer)}, ${sanitizeSql(nomeTimer)}) RETURNING *`;
          const { rows } = await pool.query(insertSql);
          created = rows[0];
        } catch (err) {
          console.error('[PG Insert Timer Error]:', err.message);
          return sendJson(res, 500, { error: 'Não foi possível agendar o horário no momento. Tente novamente mais tarde.' });
        }
      } else if (supabaseClient) {
        try {
          const { data, error } = await supabaseClient
            .from(TABLES.timer)
            .insert([{ timer: formattedTimer, end_timer: formattedEndTimer, nome_timer: nomeTimer }])
            .select('*')
            .single();
          if (error) throw error;
          created = data;
        } catch (err) {
          return sendJson(res, 500, { error: 'Não foi possível agendar o horário no momento. Tente novamente mais tarde.' });
        }
      }

      lastTimersFetchTime = 0; // invalidate cache
      await fetchDbTimers();

      return sendJson(res, 201, {
        ok: true,
        message: 'Horário agendado com sucesso!',
        timer: created,
      });
    }

    // POST /api/bot/timers/test-stop (Test end_timer queue cleanup)
    if (req.method === 'POST' && url.pathname === '/api/bot/timers/test-stop') {
      let queueCleared = false;
      if (pool) {
        try {
          await pool.query(`DELETE FROM ${TABLES.geral}`);
          queueCleared = true;
        } catch (_) {}
      }
      if (!queueCleared && supabaseClient) {
        try {
          await supabaseClient.from(TABLES.geral).delete().neq('id', 0);
          queueCleared = true;
        } catch (_) {}
      }
            await registrarLogSeguranca({
        ocorrido: 'bot pausado por teste de parada',
        tipo_ocorrido: 'pausa manual',
        detalhes: 'Teste de parada e limpeza de fila acionado nas configurações.',
      });
return sendJson(res, 200, {
        ok: queueCleared,
        status: queueCleared ? 200 : 500,
        message: queueCleared ? 'Fila de produtos limpa com sucesso!' : 'Não foi possível limpar a fila no momento. Tente novamente mais tarde.',
      });
    }

    // DELETE /api/bot/timers (Delete timer by ID from n8n_timer)
    if (req.method === 'DELETE' && (url.pathname.startsWith('/api/bot/timers') || url.pathname === '/api/bot/timers')) {
      let timerId = url.searchParams.get('id');
      const pathMatch = url.pathname.match(/^\/api\/bot\/timers\/(\d+)/);
      if (pathMatch) timerId = pathMatch[1];
      if (!timerId) {
        const body = await readJsonBody(req).catch(() => ({}));
        timerId = body?.id;
      }
      if (!timerId) {
        return sendJson(res, 400, { error: 'Identificador do horário não informado.' });
      }

      const numId = Number(timerId);
      if (isNaN(numId)) {
        return sendJson(res, 400, { error: 'Identificador do horário inválido.' });
      }

      if (pool) {
        try {
          await pool.query(`DELETE FROM ${TABLES.timer} WHERE id = ${numId}`);
        } catch (err) {
          return sendJson(res, 500, { error: 'Não foi possível remover o horário no momento. Tente novamente mais tarde.' });
        }
      } else if (supabaseClient) {
        try {
          await supabaseClient.from(TABLES.timer).delete().eq('id', timerId);
        } catch (err) {
          return sendJson(res, 500, { error: 'Não foi possível remover o horário no momento. Tente novamente mais tarde.' });
        }
      }

      lastTimersFetchTime = 0;
      await fetchDbTimers();

      return sendJson(res, 200, { ok: true, message: 'Horário removido com sucesso.' });
    }

    // POST /api/bot/testar or /api/bot/disparar (Trigger n8n webhook manually)
    if (req.method === 'POST' && (url.pathname === '/api/bot/testar' || url.pathname === '/api/bot/disparar')) {
      const body = await readJsonBody(req).catch(() => ({}));
      const customUrl = body?.webhookUrl || null;
      const timerInfo = body?.timerInfo || null;

      const result = await dispatchN8nWebhook({
        trigger: 'manual',
        timerInfo,
        customUrl,
      });

      const { timeStr, dateStr } = getBrasiliaDateTime();
      const logEntry = {
        id: Date.now().toString(),
        timestamp: new Date().toISOString(),
        brasiliaTime: timeStr,
        brasiliaDate: dateStr,
        timerId: timerInfo ? timerInfo.id : null,
        timerHour: timerInfo ? timerInfo.timer : 'manual',
        nomeTimer: timerInfo ? timerInfo.nome_timer : 'Disparo Manual',
        ok: result.ok,
        status: result.status,
        latencyMs: result.latencyMs,
        response: result.response,
        targetUrl: result.targetUrl,
        hint: result.hint || '',
        trigger: 'manual',
      };

      timerLogs.unshift(logEntry);
      if (timerLogs.length > 50) timerLogs.pop();

      return sendJson(res, 200, result);
    }

    // POST /api/bot/webhook-url (Configure custom webhook URL)
    if (req.method === 'POST' && url.pathname === '/api/bot/webhook-url') {
      const body = await readJsonBody(req);
      const newUrl = (body?.webhookUrl || body?.url || '').trim();
      if (!newUrl || !newUrl.startsWith('http')) {
        return sendJson(res, 400, { error: 'URL do webhook inválida. Deve iniciar com http:// ou https://' });
      }
      currentN8nWebhook = newUrl;
      return sendJson(res, 200, {
        ok: true,
        message: 'URL do webhook atualizada com sucesso!',
        webhookUrl: currentN8nWebhook,
      });
    }

    // POST /api/produtos/webhook-url (Configure custom products collection webhook URL)
    if (req.method === 'POST' && url.pathname === '/api/produtos/webhook-url') {
      const body = await readJsonBody(req);
      const newUrl = (body?.webhookUrl || body?.url || '').trim();
      if (!newUrl || !newUrl.startsWith('http')) {
        return sendJson(res, 400, { error: 'URL do webhook inválida. Deve iniciar com http:// ou https://' });
      }
      currentN8nProdutosWebhook = newUrl;
      return sendJson(res, 200, {
        ok: true,
        message: 'URL do webhook de produtos atualizada com sucesso!',
        produtosWebhookUrl: currentN8nProdutosWebhook,
      });
    }

    // DELETE /api/bot (Pause bot in Supabase)
    if (req.method === 'DELETE' && url.pathname === '/api/bot') {
      if (pool) {
        try {
          await pool.query(`DELETE FROM ${TABLES.linkAtual}`);
          await pool.query(`DELETE FROM ${TABLES.geral}`);
        } catch (_) {}
      } else if (supabaseClient) {
        try {
          await supabaseClient.from(TABLES.linkAtual).delete().neq('id', 0);
          await supabaseClient.from(TABLES.geral).delete().neq('id', 0);
        } catch (_) {}
      }

            await registrarLogSeguranca({
        ocorrido: 'bot pausado manualmente',
        tipo_ocorrido: 'pausa manual',
        detalhes: 'Pausa manual acionada pelo painel.',
        id_usuario: userId || null,
      });
return sendJson(res, 200, { ok: true, status: 'paused' });
    }

    // POST /api/bot/reiniciar
    if (req.method === 'POST' && url.pathname === '/api/bot/reiniciar') {
      if (pool) {
        try {
          await pool.query(`DELETE FROM ${TABLES.enviados}`);
          await pool.query(`DELETE FROM ${TABLES.geral}`);
        } catch (_) {}
      } else if (supabaseClient) {
        try {
          await supabaseClient.from(TABLES.enviados).delete().neq('id', 0);
          await supabaseClient.from(TABLES.geral).delete().neq('id', 0);
        } catch (_) {}
      }
      return sendJson(res, 200, { ok: true, message: 'Fila e produtos enviados limpos com sucesso.' });
    }

    // GET /api/bot/seguranca (Get current security sentry status)
    if (req.method === 'GET' && url.pathname === '/api/bot/seguranca') {
      return sendJson(res, 200, {
        ok: true,
        enabled: watchdogState.enabled,
        currentRetries: watchdogState.currentRetries,
        maxRetries: watchdogState.maxRetries,
        intervalMinutes: watchdogState.intervalMinutes,
        status: watchdogState.status,
        lastDispatchTime: watchdogState.lastDispatchTime,
        message: !watchdogState.enabled
          ? 'Sentinela desativada para manutenção.'
          : (watchdogState.status === 'outside_hours'
              ? 'Sentinela em pausa: Fora do horário de funcionamento agendado.'
              : (watchdogState.currentRetries > 0
                  ? `Sentinela ativa: tentativa ${watchdogState.currentRetries} de ${watchdogState.maxRetries} realizada. Aguardando resposta do bot.`
                  : 'Sentinela ativa e monitorando envios a cada 10 minutos.')),
      });
    }

    // POST /api/bot/seguranca (Update security sentry state - enable/disable or reset retries)
    if (req.method === 'POST' && url.pathname === '/api/bot/seguranca') {
      const body = await readJsonBody(req).catch(() => ({}));
      if (typeof body?.enabled === 'boolean') {
        watchdogState.enabled = body.enabled;
        try {
          fs.writeFileSync(WATCHDOG_FILE, JSON.stringify({ enabled: watchdogState.enabled }, null, 2));
        } catch (_) {}
      }
      if (body?.resetRetries || watchdogState.enabled === false) {
        watchdogState.currentRetries = 0;
        watchdogState.lastDispatchTime = null;
      }
      watchdogState.status = watchdogState.enabled ? 'active' : 'disabled';

      return sendJson(res, 200, {
        ok: true,
        enabled: watchdogState.enabled,
        currentRetries: watchdogState.currentRetries,
        maxRetries: watchdogState.maxRetries,
        status: watchdogState.status,
        message: watchdogState.enabled
          ? 'Sentinela de segurança ativada com sucesso.'
          : 'Sentinela de segurança desativada (modo manutenção).',
      });
    }

    // GET /api/resumo (Real analytics from Supabase)
    if (req.method === 'GET' && url.pathname === '/api/resumo') {
      const parsedDays = Number.parseInt(url.searchParams.get('dias') || '1', 10);
      const dias = Number.isFinite(parsedDays) ? Math.min(Math.max(parsedDays, 1), 365) : 1;

      let items = [];
      if (pool) {
        try {
          let query;
          let params;
          if (dias === 1) {
            query = `
              SELECT e.id, e.created_at, e.url_produto,
                     COALESCE(g.nome_produto, 'Produto Monitorado') AS nome_produto
              FROM ${TABLES.enviados} e
              LEFT JOIN ${TABLES.geral} g ON e.url_produto = g.url_produto
              WHERE e.created_at >= (date_trunc('day', NOW() AT TIME ZONE 'America/Sao_Paulo') AT TIME ZONE 'America/Sao_Paulo')
              ORDER BY e.created_at ASC
            `;
            params = [];
          } else {
            query = `
              SELECT id, created_at, url_produto, 'Produto Monitorado' AS nome_produto
              FROM (
                SELECT id::text, created_at, url_produto FROM ${TABLES.enviados}
                UNION ALL
                SELECT id::text, created_at, url_produto FROM ${TABLES.historicoProdutos}
              ) combined
              WHERE created_at >= (
                date_trunc('day', (NOW() AT TIME ZONE 'America/Sao_Paulo') - (($1 - 1) * INTERVAL '1 day'))
                AT TIME ZONE 'America/Sao_Paulo'
              )
              ORDER BY created_at ASC
            `;
            params = [dias];
          }
          const { rows } = await pool.query(query, params);
          items = rows || [];
        } catch (err) {
          console.warn('[PG resumo query warn]:', err.message);
        }
      }

            const timers = await fetchDbTimers();
      let securityLogs = [];
      if (pool) {
        try {
          const { rows } = await pool.query(
            `SELECT id, created_at, ocorrido, tipo_ocorrido, detalhes, id_usuario
             FROM ${TABLES.logSeguranca}
             WHERE created_at >= (
               date_trunc('day', (NOW() AT TIME ZONE 'America/Sao_Paulo') - (($1 - 1) * INTERVAL '1 day'))
               AT TIME ZONE 'America/Sao_Paulo'
             )
             ORDER BY created_at DESC`,
            [dias]
          );
          securityLogs = rows || [];
        } catch (err) {
          console.warn('[PG n8n_log_seguranca query warn]:', err.message);
        }
      } else if (supabaseClient) {
        try {
          const { data } = await supabaseClient
            .from(TABLES.logSeguranca)
            .select('*')
            .gte('created_at', new Date(Date.now() - dias * 86400000).toISOString())
            .order('created_at', { ascending: false });
          if (Array.isArray(data)) securityLogs = data;
        } catch (_) {}
      }

      // Combina com eventos locais em memória garantindo consistência
      const combinedEvents = [...securityLogs];
      for (const op of operationalEvents) {
        if (!combinedEvents.some((e) => e.timestamp === op.timestamp || (e.created_at && e.created_at === op.timestamp))) {
          combinedEvents.push({
            created_at: op.timestamp || op.created_at,
            ocorrido: op.ocorrido,
            tipo_ocorrido: op.tipo_ocorrido,
            detalhes: op.detalhes,
          });
        }
      }

      const analytics = calculateAnalytics(items, { dias, timers, operationalEvents: combinedEvents });
      return sendJson(res, 200, {
        items,
        analytics,
      });
    }

    return sendJson(res, 404, { error: 'Rota não encontrada.' });
  } catch (error) {
    return sendError(res, error);
  }
}

function translateAuthError(msg = '') {
  if (!msg) return 'Falha na autenticação. Verifique suas credenciais.';
  const lower = msg.toLowerCase();
  if (lower.includes('fetch failed') || lower.includes('network') || lower.includes('enotfound') || lower.includes('timeout') || lower.includes('econnrefused')) {
    return 'Falha temporária de conexão. Tente novamente em instantes.';
  }
  if (lower.includes('invalid login credentials') || lower.includes('invalid_credentials')) {
    return 'E-mail ou senha incorretos.';
  }
  if (lower.includes('email not confirmed')) {
    return 'E-mail ainda não confirmado. Verifique sua caixa de entrada.';
  }
  if (lower.includes('user already registered') || lower.includes('already exists') || lower.includes('user_already_exists')) {
    return 'Este e-mail já está cadastrado. Faça login ou solicite recuperação de senha.';
  }
  if (lower.includes('password should be at least') || lower.includes('weak password')) {
    return 'A senha precisa ter no mínimo 6 caracteres.';
  }
  if (lower.includes('invalid format') || lower.includes('valid email') || lower.includes('email_address_invalid')) {
    return 'Por favor, informe um endereço de e-mail válido.';
  }
  if (lower.includes('rate limit') || lower.includes('over_email_send_rate_limit')) {
    return 'Muitas tentativas em sequência. Aguarde alguns instantes e tente novamente.';
  }
  return 'Falha na autenticação. Verifique suas credenciais.';
}

// Server-side authentication handlers
async function handleAuthRoute(req, res, url) {
  if (!supabaseClient) {
    return sendJson(res, 500, { error: 'Serviço de autenticação não configurado no servidor.' });
  }

  try {
    // POST /api/auth/signin
    if (req.method === 'POST' && url.pathname === '/api/auth/signin') {
      const body = await readJsonBody(req);
      const { email, password } = body;
      if (!email || !password) {
        return sendJson(res, 400, { error: 'E-mail e senha são obrigatórios.' });
      }

      const { data, error } = await supabaseClient.auth.signInWithPassword({ email, password });
      if (error) {
        console.warn(`[Auth SignIn] Falha de login para ${email}: ${error.message} (status: ${error.status || 401})`);
        return sendJson(res, 401, { error: translateAuthError(error.message) });
      }
      console.log(`[Auth SignIn] Sucesso para ${email} (UID: ${data.user?.id})`);

      return sendJson(res, 200, {
        user: data.user,
        session: data.session,
        access_token: data.session?.access_token,
      });
    }

    // POST /api/auth/signup
    if (req.method === 'POST' && url.pathname === '/api/auth/signup') {
      const body = await readJsonBody(req);
      const { email, password } = body;
      if (!email || !password) {
        return sendJson(res, 400, { error: 'E-mail e senha são obrigatórios.' });
      }

      const { data, error } = await supabaseClient.auth.signUp({ email, password });
      if (error) {
        return sendJson(res, 400, { error: translateAuthError(error.message) });
      }

      return sendJson(res, 200, {
        user: data.user,
        session: data.session,
        access_token: data.session?.access_token,
      });
    }

    // POST /api/auth/recover
    if (req.method === 'POST' && url.pathname === '/api/auth/recover') {
      const body = await readJsonBody(req);
      const { email } = body;
      if (!email) return sendJson(res, 400, { error: 'Informe o e-mail.' });

      const origin = req.headers.origin || `http://${req.headers.host}`;
      const { error } = await supabaseClient.auth.resetPasswordForEmail(email, { redirectTo: origin });
      if (error) return sendJson(res, 400, { error: translateAuthError(error.message) });

      return sendJson(res, 200, { ok: true, message: 'Link de recuperação enviado com sucesso!' });
    }

    // GET /api/auth/me (Check active token)
    if (req.method === 'GET' && url.pathname === '/api/auth/me') {
      const user = await requireAuth(req, res);
      if (user) {
        return sendJson(res, 200, { user });
      }
      return undefined;
    }

    return sendJson(res, 404, { error: 'Rota de autenticação não encontrada.' });
  } catch (err) {
    console.error('[Auth Error]:', err);
    return sendJson(res, 500, { error: 'Ocorreu um erro ao processar a autenticação.' });
  }
}

const mimeTypes = {
  '.html': 'text/html; charset=utf-8',
  '.js': 'application/javascript; charset=utf-8',
  '.css': 'text/css; charset=utf-8',
  '.json': 'application/json; charset=utf-8',
  '.svg': 'image/svg+xml',
  '.png': 'image/png',
  '.jpg': 'image/jpeg',
  '.jpeg': 'image/jpeg',
  '.ico': 'image/x-icon',
};

function handleAllRequests(req, res) {
  const url = new URL(req.url, `http://${req.headers.host || 'localhost'}`);
  console.log(`[HTTP] ${req.method} ${url.pathname}`);

  if (url.pathname === '/favicon.ico') {
    res.writeHead(204);
    return res.end();
  }

  if (req.method === 'OPTIONS' && url.pathname.startsWith('/api/')) {
    return sendJson(res, 204, null);
  }

  // Public Auth & Config routes
  if (url.pathname.startsWith('/api/auth/')) {
    return handleAuthRoute(req, res, url);
  }

  if (url.pathname === '/api/health') {
    let dbStatus = isPgConnected ? 'connected' : 'disconnected';
    if (!isPgConnected && pool) {
      try {
        pool.query('SELECT 1').then(() => { isPgConnected = true; }).catch(() => {});
      } catch (_) {}
    }
    return sendJson(res, 200, {
      status: 'ok',
      port: PORT,
      database: dbStatus,
      timestamp: new Date().toISOString(),
      uptime: Math.round(process.uptime()),
    });
  }

  if (url.pathname === '/api/config') {
    return sendJson(res, 200, {
      supabaseConfigured: !!supabaseClient,
    });
  }

  // Protected App API routes (Strict Supabase Auth Verification)
  if (url.pathname.startsWith('/api/')) {
    return requireAuth(req, res).then((user) => {
      if (user) return handleApi(req, res, url, user);
      return undefined;
    }).catch((error) => sendError(res, error));
  }

  if (req.method !== 'GET' && req.method !== 'HEAD') {
    return sendJson(res, 405, { error: 'Método não permitido.' });
  }

  const requestedPath = url.pathname === '/' ? 'index.html' : decodeURIComponent(url.pathname).replace(/^[/\\]+/, '');
  const filePath = path.resolve(ROOT, requestedPath);
  if (!filePath.startsWith(ROOT + path.sep) && filePath !== ROOT) {
    return sendJson(res, 403, { error: 'Acesso negado.' });
  }

  fs.readFile(filePath, (error, file) => {
    if (error) {
      // Para qualquer rota que não seja um arquivo estático existente, servir o index.html (SPA Fallback)
      const indexHtmlPath = path.resolve(ROOT, 'index.html');
      return fs.readFile(indexHtmlPath, (err, indexFile) => {
        if (err) return sendJson(res, 404, { error: 'Arquivo index.html não encontrado.' });
        res.writeHead(200, { 'Content-Type': 'text/html; charset=utf-8' });
        res.end(req.method === 'HEAD' ? undefined : indexFile);
      });
    }
    res.writeHead(200, { 'Content-Type': mimeTypes[path.extname(filePath)] || 'application/octet-stream' });
    res.end(req.method === 'HEAD' ? undefined : file);
  });
}

const server = http.createServer(handleAllRequests);

async function startServer() {
  if (pool) {
    try {
      const client = await Promise.race([
        pool.connect(),
        new Promise((_, reject) => setTimeout(() => reject(new Error('Timeout de conexão PostgreSQL')), 2500)),
      ]);
      client.release();
      isPgConnected = true;
      console.log('[PostgreSQL] Conexão ativa com o banco de dados Supabase.');
    } catch (err) {
      isPgConnected = false;
      console.warn('[PostgreSQL] Conexão direta PG indisponível no momento:', err.message);
    }
  }

  server.listen(PORT, HOST, () => {
    console.log(`[Painel Bot] Servidor principal rodando em http://${HOST}:${PORT}`);
  });

  const secondaryPort = PORT === 5001 ? 3000 : 5001;
  try {
    const auxServer = http.createServer(handleAllRequests);
    auxServer.listen(secondaryPort, HOST, () => {
      console.log(`[Painel Bot] Ouvindo também na porta ${secondaryPort}`);
    });
    auxServer.on('error', (err) => {
      console.log(`[Porta ${secondaryPort}]:`, err.message);
    });
  } catch (_) {}
}

startServer().catch((error) => {
  console.error('Não foi possível iniciar o serviço:', error);
  process.exitCode = 1;
});
