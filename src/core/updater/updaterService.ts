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

let pendingUpdate: Update | null = null;

export async function checkForAppUpdates(onProgress?: (status: UpdateStatus) => void): Promise<UpdateStatus> {
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
