import { invoke } from '@tauri-apps/api/core';
import { FullDatabaseDump } from '../database/db';

export interface EmailBackupResult {
  success: boolean;
  message: string;
}

function stringToBase64(str: string): string {
  try {
    return btoa(unescape(encodeURIComponent(str)));
  } catch (err) {
    console.error('Erro ao converter string para base64:', err);
    return '';
  }
}

/**
 * Envia o backup por e-mail diretamente via Resend API através do canal nativo (sem restrições de CORS)
 */
export async function sendBackupByEmail(
  toEmail: string,
  companyName: string,
  dump: FullDatabaseDump,
  customApiKey?: string
): Promise<EmailBackupResult> {
  if (!toEmail || !toEmail.includes('@')) {
    return {
      success: false,
      message: 'Endereço de e-mail inválido. Informe um e-mail válido nas configurações.'
    };
  }

  const apiKey = (customApiKey || '').trim();
  if (!apiKey || !apiKey.startsWith('re_')) {
    return {
      success: false,
      message: 'Chave de API do Resend não configurada. Crie uma chave grátis em resend.com (ex: re_1234...) e cole no campo "Chave de API Resend" para disparar.'
    };
  }

  const jsonContent = JSON.stringify(dump, null, 2);
  const base64Attachment = stringToBase64(jsonContent);
  const dateStr = new Date().toLocaleDateString('pt-BR');
  const timeStr = new Date().toLocaleTimeString('pt-BR');
  const filename = `backup_${companyName.toLowerCase().replace(/[^a-z0-9]/g, '_')}_${new Date().toISOString().slice(0, 10)}.json`;

  const htmlBody = `
    <div style="font-family: Arial, sans-serif; max-width: 600px; margin: 0 auto; padding: 20px; border: 1px solid #e2e8f0; border-radius: 12px; background-color: #ffffff;">
      <div style="background-color: #059669; padding: 15px; border-radius: 8px; text-align: center; color: #ffffff;">
        <h2 style="margin: 0; font-size: 20px;">📦 Cópia de Segurança do Mercado POS</h2>
        <p style="margin: 5px 0 0 0; font-size: 13px; opacity: 0.9;">${companyName}</p>
      </div>

      <div style="padding: 20px 0; color: #334155; line-height: 1.6;">
        <p style="font-size: 14px; margin-top: 0;">Olá!</p>
        <p style="font-size: 14px;">
          Este é o seu arquivo de <strong>backup de salvaguarda externa</strong> gerado em <strong>${dateStr} às ${timeStr}</strong>.
        </p>

        <div style="background-color: #f8fafc; border: 1px solid #e2e8f0; border-radius: 8px; padding: 15px; margin: 15px 0;">
          <h4 style="margin: 0 0 10px 0; font-size: 13px; text-transform: uppercase; color: #64748b;">Resumo dos Dados Salvos:</h4>
          <ul style="margin: 0; padding-left: 20px; font-size: 13px; color: #1e293b;">
            <li><strong>${dump.recordsCount.products}</strong> produtos cadastrados</li>
            <li><strong>${dump.recordsCount.sales}</strong> vendas registradas</li>
            <li><strong>${dump.recordsCount.cashMovements}</strong> movimentações de caixa</li>
            <li><strong>${dump.recordsCount.customers}</strong> clientes na base</li>
          </ul>
        </div>

        <p style="font-size: 13px; color: #64748b;">
          📁 O arquivo de backup completo (<code>${filename}</code>) está anexado a este e-mail. Guarde-o em segurança para qualquer eventualidade ou restauração.
        </p>
      </div>

      <div style="border-top: 1px solid #e2e8f0; padding-top: 15px; text-align: center; font-size: 11px; color: #94a3b8;">
        Mercearia Uber POS • Sistema de Gestão Comercial e Frente de Caixa
      </div>
    </div>
  `;

  const payload = JSON.stringify({
    from: 'Mercado POS <onboarding@resend.dev>',
    to: [toEmail],
    subject: `[Backup Mercado POS] - Cópia de Segurança ${dateStr} (${companyName})`,
    html: htmlBody,
    attachments: [
      {
        filename,
        content: base64Attachment,
      },
    ],
  });

  try {
    const result = await invoke<string>('send_resend_email', {
      apiKey,
      payload
    });

    console.log('Resposta do envio de e-mail:', result);
    return {
      success: true,
      message: `Backup enviado com sucesso para ${toEmail}!`
    };
  } catch (err: any) {
    console.error('Erro na requisição nativa de e-mail:', err);
    return {
      success: false,
      message: `Erro no envio de e-mail: ${err.message || err}`
    };
  }
}
