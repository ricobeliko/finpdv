import { check, Update } from '@tauri-apps/plugin-updater';
import { relaunch } from '@tauri-apps/plugin-process';

export interface UpdateStatus {
  state: 'IDLE' | 'CHECKING' | 'UP_TO_DATE' | 'AVAILABLE' | 'DOWNLOADING' | 'DOWNLOADED' | 'ERROR';
  version?: string;
  body?: string;
  error?: string;
  downloadedBytes?: number;
  totalBytes?: number;
}

// Seguranca: Updater FinPDV desabilitado ate provisionamento de par Minisign exclusivo para ricobeliko/finpdv
// Jamais faz fallback para ricobeliko/mercado-pos
export const FINPDV_UPDATER_ACTIVE = false;

let pendingUpdate: Update | null = null;

export async function checkForAppUpdates(onProgress?: (status: UpdateStatus) => void): Promise<UpdateStatus> {
  if (!FINPDV_UPDATER_ACTIVE) {
    const status: UpdateStatus = {
      state: 'UP_TO_DATE',
      body: 'FinPDV v0.2.3 — Canal de atualização exclusivo FinPDV aguardando provisionamento de chave Minisign.'
    };
    if (onProgress) onProgress(status);
    return status;
  }

  try {
    if (onProgress) onProgress({ state: 'CHECKING' });

    const update = await check();
    if (!update) {
      const status: UpdateStatus = { state: 'UP_TO_DATE' };
      if (onProgress) onProgress(status);
      return status;
    }

    pendingUpdate = update;
    const status: UpdateStatus = {
      state: 'AVAILABLE',
      version: update.version,
      body: update.body
    };
    if (onProgress) onProgress(status);
    return status;
  } catch (err: any) {
    console.warn('Erro ao verificar atualizações:', err);
    const status: UpdateStatus = {
      state: 'ERROR',
      error: err?.message || 'Não foi possível conectar ao servidor de atualizações.'
    };
    if (onProgress) onProgress(status);
    return status;
  }
}

export async function installAndRestartApp(onProgress?: (status: UpdateStatus) => void): Promise<void> {
  if (!pendingUpdate) {
    const checkResult = await checkForAppUpdates(onProgress);
    if (checkResult.state !== 'AVAILABLE' || !pendingUpdate) {
      return;
    }
  }

  try {
    let downloaded = 0;
    let total = 0;

    await pendingUpdate.downloadAndInstall((event) => {
      if (event.event === 'Started') {
        total = event.data.contentLength || 0;
        if (onProgress) {
          onProgress({
            state: 'DOWNLOADING',
            version: pendingUpdate?.version,
            downloadedBytes: 0,
            totalBytes: total
          });
        }
      } else if (event.event === 'Progress') {
        downloaded += event.data.chunkLength;
        if (onProgress) {
          onProgress({
            state: 'DOWNLOADING',
            version: pendingUpdate?.version,
            downloadedBytes: downloaded,
            totalBytes: total
          });
        }
      } else if (event.event === 'Finished') {
        if (onProgress) {
          onProgress({
            state: 'DOWNLOADED',
            version: pendingUpdate?.version
          });
        }
      }
    });

    await relaunch();
  } catch (err: any) {
    console.error('Erro ao instalar atualização:', err);
    if (onProgress) {
      onProgress({
        state: 'ERROR',
        error: err?.message || 'Falha ao baixar e aplicar atualização.'
      });
    }
  }
}

/**
 * Converte notas de release em formato markdown / texto em uma lista limpa de itens de destaque.
 */
export function parseReleaseHighlights(body?: string, version?: string): string[] {
  if (body) {
    const lines = body
      .split(/[\r\n]+/)
      .map((l) =>
        l
          .trim()
          .replace(/^[-*•]\s*/, '')
          .replace(/^#{1,6}\s*/, '')
          .replace(/^feat(\([^)]+\))?:\s*/i, '')
          .replace(/^fix(\([^)]+\))?:\s*/i, '')
          .replace(/^chore(\([^)]+\))?:\s*/i, '')
      )
      .filter((l) => l.length > 3 && !l.toLowerCase().includes('atualização automática'));

    if (lines.length > 0) {
      return lines.slice(0, 6);
    }
  }

  // Catálogo de novidades por versão como fallback inteligente
  if (version) {
    const cleanVersion = version.replace(/^v/, '').trim();
    if (cleanVersion === '0.2.2' || cleanVersion === '0.2.1') {
      return [
        'Consulta de produtos via Bluesoft Cosmos por código de barras',
        'Classificação inteligente de categorias sem falso positivo',
        'Suporte à tecla ESC no modal de cadastro e edição de produtos',
        'Relatório dinâmico de novidades no assistente de atualização',
        'Fallback automático para Open Food Facts e cadastro manual'
      ];
    }
    if (cleanVersion === '0.2.0') {
      return [
        'Novo motor transacional SQLite nativo em Rust',
        'Soft Cancel total nas vendas com estorno atômico de caixa e estoque',
        'Suporte oficial a Open Price / Varejo Diversos no PDV (código 1)',
        'Backup pré-migração automático e proteção de dados históricos'
      ];
    }
  }

  return [
    'Melhorias de desempenho e estabilidade do sistema',
    'Auditoria e integridade de estoque em tempo real',
    'Segurança e consistência nas operações de PDV',
    'Backup automático de segurança'
  ];
}

