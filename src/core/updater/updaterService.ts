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

export type UpdaterProvider = 'DISABLED' | 'CUSTOM_ENDPOINT';

/**
 * Governança de Atualizações FinPDV:
 * Na v1.0.0, o repositório 'ricobeliko/finpdv' é privado. GitHub Releases de repositórios
 * privados exigem autenticação (PAT/Token). É TERMINANTEMENTE PROIBIDO expor credenciais
 * do proprietário no aplicativo cliente.
 * 
 * Por essa razão, a distribuição da v1.0.0 é feita manualmente via instalador oficial homologado.
 * O auto-updater permanece desabilitado (AUTO_UPDATER_ENABLED = false).
 * A infraestrutura e a chave pública Minisign continuam preservadas para fases futuras
 * quando um endpoint próprio seguro (API FinPDV / CDN controlada) for integrado.
 */
export const UPDATER_PROVIDER: UpdaterProvider = 'DISABLED';
export const AUTO_UPDATER_ENABLED = false;
export const FINPDV_UPDATER_ACTIVE = false;

let pendingUpdate: Update | null = null;

export async function checkForAppUpdates(onProgress?: (status: UpdateStatus) => void): Promise<UpdateStatus> {
  if (!AUTO_UPDATER_ENABLED || UPDATER_PROVIDER === 'DISABLED') {
    const status: UpdateStatus = {
      state: 'UP_TO_DATE',
      body: 'FinPDV v1.0.0 — Canal de atualizações automáticas desabilitado (distribuição manual homologada).'
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
    if (cleanVersion === '1.0.0') {
      return [
        'Primeira versão comercial estável FinPDV',
        'Arquitetura offline-first com banco de dados SQLite nativo isolado',
        'Motor transacional Rust com integridade financeira e estorno atômico',
        'Sistema de autenticação com Argon2id nativo, RBAC e auditoria',
        'Assistente de Onboarding para configuração de Empresa, Loja e Terminal',
        'Impressão térmica direta de cupons e controle completo de caixa'
      ];
    }
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

