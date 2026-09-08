import React, { useState } from 'react';
import { X, ArrowRight, ArrowLeftRight } from 'lucide-react';
import { MovementType, Product } from '../types';
import { useFocusTrap } from '../../../shared/hooks/useFocusTrap';

interface StockAdjustmentModalProps {
  isOpen: boolean;
  product: Product;
  onClose: () => void;
  onConfirm: (adjustmentData: {
    type: MovementType;
    quantity: number;
    reason: string;
    notes: string;
  }) => void;
}

export function StockAdjustmentModal({ isOpen, product, onClose, onConfirm }: StockAdjustmentModalProps) {
  const trapRef = useFocusTrap<HTMLDivElement>({
    isActive: isOpen,
    onEscape: onClose,
    autoFocus: true,
  });

  if (!isOpen) return null;

  const [type, setType] = useState<MovementType>('ADJUST_IN');
  const [quantity, setQuantity] = useState('');
  const [reason, setReason] = useState('Entrada de Estoque Manual');
  const [notes, setNotes] = useState('');

  const deltaNumber = Number(quantity) || 0;
  let calculatedNextBalance = product.currentStock;

  if (type === 'ADJUST_IN' || type === 'PURCHASE') {
    calculatedNextBalance = product.currentStock + Math.abs(deltaNumber);
  } else if (type === 'ADJUST_OUT' || type === 'LOSS' || type === 'SALE') {
    calculatedNextBalance = product.currentStock - Math.abs(deltaNumber);
  } else if (type === 'COUNT_CORRECTION') {
    calculatedNextBalance = deltaNumber;
  }

  const handleSubmit = (e: React.FormEvent) => {
    e.preventDefault();
    if (!deltaNumber && type !== 'COUNT_CORRECTION') {
      alert('Informe uma quantidade válida para movimentação.');
      return;
    }
    if (calculatedNextBalance < 0) {
      alert('Operação cancelada: O saldo de estoque resultante não pode ser negativo.');
      return;
    }

    onConfirm({
      type,
      quantity: deltaNumber,
      reason,
      notes
    });
  };

  return (
    <div className="fixed inset-0 bg-black/60 z-50 flex items-center justify-center p-4">
      <div ref={trapRef} role="dialog" aria-modal="true" className="bg-surface w-full max-w-md rounded-2xl shadow-2xl border border-slate-200 overflow-hidden">
        <div className="bg-slate-50 px-6 py-4 border-b border-slate-200 flex items-center justify-between">
          <div>
            <h3 className="font-bold text-textMain text-base flex items-center space-x-2">
              <ArrowLeftRight className="w-5 h-5 text-primary" />
              <span>Ajustar Saldo de Estoque</span>
            </h3>
            <p className="text-xs text-textMuted">{product.name} (Cód: {product.internalCode})</p>
          </div>
          <button onClick={onClose} className="text-textMuted hover:text-textMain p-1 rounded-lg">
            <X className="w-5 h-5" />
          </button>
        </div>

        <form onSubmit={handleSubmit} className="p-6 space-y-4">
          {/* TIPO DE MOVIMENTO */}
          <div>
            <label className="block text-xs font-semibold text-textMuted uppercase mb-1">Tipo de Operação *</label>
            <select
              value={type}
              onChange={(e) => {
                const newType = e.target.value as MovementType;
                setType(newType);
                if (newType === 'ADJUST_IN') setReason('Entrada manual / Bonificação');
                if (newType === 'ADJUST_OUT') setReason('Devolução ao fornecedor / Uso interno');
                if (newType === 'LOSS') setReason('Avaria / Validade vencida / Quebra');
                if (newType === 'COUNT_CORRECTION') setReason('Contagem de inventário / Balanço');
              }}
              className="w-full px-3 py-2 border border-slate-200 rounded-lg text-sm bg-surface focus:outline-none focus:ring-2 focus:ring-primary/30"
            >
              <option value="ADJUST_IN">Entrada Manual (+)</option>
              <option value="ADJUST_OUT">Saída Manual (-)</option>
              <option value="LOSS">Perda / Avaria / Vencido (-)</option>
              <option value="COUNT_CORRECTION">Contagem de Inventário (Substituição com log)</option>
            </select>
          </div>

          {/* QUANTIDADE */}
          <div>
            <label className="block text-xs font-semibold text-textMuted uppercase mb-1">
              {type === 'COUNT_CORRECTION' ? 'Nova Quantidade Contada no Balanço' : `Quantidade a Movimentar (${product.unitMeasure}) *`}
            </label>
            <input
              type="number"
              required
              min={type === 'COUNT_CORRECTION' ? '0' : '1'}
              value={quantity}
              onChange={(e) => setQuantity(e.target.value)}
              placeholder="0"
              className="w-full px-3 py-2 border border-slate-200 rounded-lg text-base font-mono font-bold focus:outline-none focus:ring-2 focus:ring-primary/30"
            />
          </div>

          {/* SALDO ATUAL -> RESULTANTE */}
          <div className="bg-slate-50 p-3.5 rounded-xl border border-slate-200 flex items-center justify-between">
            <div>
              <p className="text-[11px] text-textMuted uppercase font-bold">Saldo Atual</p>
              <p className="text-base font-mono font-bold text-slate-700">{product.currentStock} {product.unitMeasure}</p>
            </div>
            <ArrowRight className="w-5 h-5 text-slate-400" />
            <div className="text-right">
              <p className="text-[11px] text-textMuted uppercase font-bold">Saldo Resultante</p>
              <p className={`text-base font-mono font-bold ${calculatedNextBalance < 0 ? 'text-danger' : 'text-primary'}`}>
                {calculatedNextBalance} {product.unitMeasure}
              </p>
            </div>
          </div>

          {/* MOTIVO */}
          <div>
            <label className="block text-xs font-semibold text-textMuted uppercase mb-1">Motivo / Justificativa *</label>
            <input
              type="text"
              required
              value={reason}
              onChange={(e) => setReason(e.target.value)}
              className="w-full px-3 py-2 border border-slate-200 rounded-lg text-xs focus:outline-none focus:ring-2 focus:ring-primary/30"
            />
          </div>

          {/* OBSERVAÇÕES */}
          <div>
            <label className="block text-xs font-semibold text-textMuted uppercase mb-1">Observações Adicionais</label>
            <textarea
              rows={2}
              value={notes}
              onChange={(e) => setNotes(e.target.value)}
              placeholder="Detalhes opcionais sobre lote ou responsável..."
              className="w-full px-3 py-2 border border-slate-200 rounded-lg text-xs focus:outline-none focus:ring-2 focus:ring-primary/30"
            />
          </div>

          <div className="flex justify-end space-x-3 pt-2">
            <button
              type="button"
              onClick={onClose}
              className="px-4 py-2 text-xs font-bold text-slate-600 hover:bg-slate-100 rounded-lg"
            >
              Cancelar
            </button>
            <button
              type="submit"
              disabled={calculatedNextBalance < 0}
              className="bg-primary hover:bg-primary-hover disabled:bg-slate-300 text-white px-5 py-2 rounded-lg text-xs font-bold shadow-sm"
            >
              Confirmar Movimentação
            </button>
          </div>
        </form>
      </div>
    </div>
  );
}