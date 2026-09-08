/**
 * Sanitizador de Erros e Mensagens Operacionais para o FinPDV
 *
 * Garante que a UI nunca exiba stack traces, queries SQL brutas, paths sensíveis
 * do sistema de arquivos ou hashes criptográficos ao operador, fornecendo mensagens
 * claras, objetivas e acionáveis.
 */

export function sanitizeErrorMessage(err: unknown, fallbackMessage = 'Ocorreu um erro operacional no sistema.'): string {
  if (!err) return fallbackMessage;

  const raw = typeof err === 'string' 
    ? err 
    : (err as any)?.message || String(err);

  const lower = raw.toLowerCase();

  // 1. Concorrência e bloqueio no SQLite
  if (lower.includes('busy') || lower.includes('locked') || lower.includes('database is locked')) {
    return 'Banco de dados ocupado. Aguarde alguns instantes e tente novamente.';
  }

  // 2. Corrupção ou falha física de banco
  if (lower.includes('corrupt') || lower.includes('malformed') || lower.includes('corrupted_database')) {
    return 'Alerta de integridade do banco de dados. Entre em contato com o suporte ou restaure um backup.';
  }

  // 3. Violação de integridade referencial
  if (lower.includes('foreign_key') || lower.includes('foreign key violation')) {
    return 'Falha de integridade referencial: O backup possui dados inconsistentes e a restauração foi cancelada para proteger o banco.';
  }

  // 4. Backup de outra empresa
  if (lower.includes('wrong_business_cnpj') || lower.includes('outra empresa') || lower.includes('cnpj divergente') || lower.includes('different business')) {
    return 'Este backup pertence a outra empresa. Operação cancelada para sua segurança.';
  }

  // 5. Permissão negada / RBAC
  if (lower.includes('acesso negado') || lower.includes('não possui a permissão') || lower.includes('permissão de administrador')) {
    return 'Operação não autorizada. Permissão de administrador necessária.';
  }

  // 6. Sessão revogada ou expirada
  if (lower.includes('sessão revogada') || lower.includes('inativado ou desativado') || lower.includes('não autenticado') || lower.includes('nenhuma sessão ativa') || lower.includes('sessão expirada')) {
    return 'Sessão expirada ou não autenticada. Por favor, faça login novamente no PDV.';
  }

  // 7. Impressora e periféricos
  if (lower.includes('printer') || lower.includes('spooler') || lower.includes('impressora')) {
    return 'Impressora não respondeu. Comprovante pode ser reimpresso [F10].';
  }

  // 8. Ocultar SQL bruto, caminhos de arquivo ou hashes
  if (
    lower.includes('select ') || 
    lower.includes('insert ') || 
    lower.includes('update ') || 
    lower.includes('delete from') ||
    lower.includes('pragma ') ||
    lower.includes('c:\\') ||
    lower.includes('d:\\') ||
    lower.includes('$argon2id$')
  ) {
    console.error('[FinPDV Sanitized Error]', raw);
    return 'Erro ao processar dados no banco local. O registro anterior foi preservado.';
  }

  return raw;
}
