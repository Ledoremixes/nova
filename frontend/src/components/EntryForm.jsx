import React, { useMemo, useState, useEffect } from 'react';

const NATURE_OPTIONS = [
  'Ingressi serate',
  'Bar',
  'Tesseramenti',
  'Guardaroba',
  'Acquisti',
  'Compensi insegnanti',
  'Servizi',
  'Altro',
];

// Mappa conto -> natura (personalizzabile)
function guessNatureFromAccount(code) {
  const c = (code || '').toString().trim().toUpperCase();
  if (!c) return '';

  if (c === 'C') return 'Bar';
  if (c === 'AS') return 'Tesseramenti';
  if (c === 'G') return 'Guardaroba';

  return '';
}

export default function EntryForm({ onSave, accounts = [] }) {
  const [date, setDate] = useState('');
  const [description, setDescription] = useState('');
  const [amountIn, setAmountIn] = useState('');
  const [amountOut, setAmountOut] = useState('');
  const [accountCode, setAccountCode] = useState('');
  const [method, setMethod] = useState('');
  const [center, setCenter] = useState('');
  const [note, setNote] = useState('');
  const [nature, setNature] = useState('');

  // ✅ IVA
  // vatSide: null | 'debit' | 'credit'
  const [vatSide, setVatSide] = useState(null);
  const [vatRate, setVatRate] = useState('');
  const [vatAmount, setVatAmount] = useState('');

  const inVal = useMemo(() => Number(amountIn || 0), [amountIn]);
  const outVal = useMemo(() => Number(amountOut || 0), [amountOut]);

  const canSubmit = useMemo(() => {
    return Boolean(description.trim()) && (inVal > 0 || outVal > 0);
  }, [description, inVal, outVal]);

  // ✅ Autoguess natura da conto (senza forzare se l'hai già scelta tu)
  useEffect(() => {
    const guessed = guessNatureFromAccount(accountCode);
    if (guessed && (!nature || !NATURE_OPTIONS.includes(nature))) {
      setNature(guessed);
    }
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [accountCode]);

  // ✅ Default intelligente IVA:
  // - se è un'entrata e conto C, propongo IVA a debito
  // - se è un'uscita e hai inserito VAT, propongo IVA a credito
  useEffect(() => {
    const hasVat = Number(vatAmount || 0) > 0 || Number(vatRate || 0) > 0;

    // se l'utente ha già scelto, non tocco
    if (vatSide) return;

    if (inVal > 0 && outVal <= 0) {
      const code = (accountCode || '').trim().toUpperCase();
      if (code === 'C') setVatSide('debit');
      return;
    }

    if (outVal > 0 && inVal <= 0 && hasVat) {
      setVatSide('credit');
    }
  }, [inVal, outVal, vatAmount, vatRate, vatSide, accountCode]);

  // ✅ Se l'utente mette "IVA nessuna", svuoto i campi IVA
  useEffect(() => {
    if (vatSide !== null) return;
    if (vatRate !== '') setVatRate('');
    if (vatAmount !== '') setVatAmount('');
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [vatSide]);

  async function handleSubmit(e) {
    e.preventDefault();

    const entry = {
      date: date || null,
      description: description || '',
      amountIn: inVal,
      amountOut: outVal,
      accountCode: accountCode || null,
      method: method || null,
      center: center || null,
      note: note || null,
      nature: nature || null,

      // ✅ IVA separata
      vatSide: vatSide, // null | 'debit' | 'credit'
      vatRate: vatSide ? (vatRate !== '' ? Number(vatRate) : null) : null,
      vatAmount: vatSide ? (vatAmount !== '' ? Number(vatAmount) : null) : null,
    };

    await onSave(entry);

    setDate('');
    setDescription('');
    setAmountIn('');
    setAmountOut('');
    setAccountCode('');
    setMethod('');
    setCenter('');
    setNote('');
    setNature('');
    setVatSide(null);
    setVatRate('');
    setVatAmount('');
  }

  function clearAmounts() {
    setAmountIn('');
    setAmountOut('');
  }

  const vatDisabled = vatSide === null;

  return (
    <form className="entry-form-modern" onSubmit={handleSubmit}>
      <div className="ef-grid">
        <label className="field">
          <span className="field-label">Data</span>
          <input type="date" value={date} onChange={e => setDate(e.target.value)} />
        </label>

        <label className="field ef-span-2">
          <span className="field-label">Descrizione</span>
          <input
            type="text"
            value={description}
            onChange={e => setDescription(e.target.value)}
            placeholder="Es: Incasso serata, Bonifico insegnante, Acquisto bevande…"
          />
        </label>

        <label className="field">
          <span className="field-label">Entrata</span>
          <input
            type="number"
            step="0.01"
            value={amountIn}
            onChange={e => setAmountIn(e.target.value)}
            placeholder="0,00"
          />
        </label>

        <label className="field">
          <span className="field-label">Uscita</span>
          <input
            type="number"
            step="0.01"
            value={amountOut}
            onChange={e => setAmountOut(e.target.value)}
            placeholder="0,00"
          />
        </label>

        <label className="field ef-span-2">
          <span className="field-label">Conto</span>
          <select value={accountCode} onChange={e => setAccountCode(e.target.value)}>
            <option value="">— Seleziona conto —</option>
            {accounts.map(a => (
              <option key={a.id} value={a.code}>
                {a.code} - {a.name}
              </option>
            ))}
          </select>
        </label>

        <label className="field">
          <span className="field-label">Metodo</span>
          <input
            type="text"
            value={method}
            onChange={e => setMethod(e.target.value)}
            placeholder="Contanti / POS / Bonifico…"
          />
        </label>

        <label className="field">
          <span className="field-label">Centro</span>
          <input
            type="text"
            value={center}
            onChange={e => setCenter(e.target.value)}
            placeholder="Bar / Ingresso / Sala…"
          />
        </label>

        <label className="field">
          <span className="field-label">Natura</span>
          <select value={nature} onChange={e => setNature(e.target.value)}>
            <option value="">— Seleziona —</option>
            {NATURE_OPTIONS.map(n => (
              <option key={n} value={n}>{n}</option>
            ))}
          </select>
        </label>

        {/* ✅ IVA SIDE */}
        <div className="field ef-span-2">
          <span className="field-label">IVA</span>
          <div style={{ display: 'flex', gap: 10, flexWrap: 'wrap' }}>
            <label style={{ display: 'inline-flex', gap: 6, alignItems: 'center' }}>
              <input
                type="radio"
                name="vatSide"
                checked={vatSide === null}
                onChange={() => setVatSide(null)}
              />
              Nessuna
            </label>
            <label style={{ display: 'inline-flex', gap: 6, alignItems: 'center' }}>
              <input
                type="radio"
                name="vatSide"
                checked={vatSide === 'debit'}
                onChange={() => setVatSide('debit')}
              />
              A debito (vendite)
            </label>
            <label style={{ display: 'inline-flex', gap: 6, alignItems: 'center' }}>
              <input
                type="radio"
                name="vatSide"
                checked={vatSide === 'credit'}
                onChange={() => setVatSide('credit')}
              />
              A credito (acquisti)
            </label>
          </div>
        </div>

        <label className="field">
          <span className="field-label">IVA %</span>
          <input
            type="number"
            step="0.01"
            value={vatRate}
            onChange={e => setVatRate(e.target.value)}
            placeholder="Es: 22"
            disabled={vatDisabled}
          />
        </label>

        <label className="field">
          <span className="field-label">Importo IVA</span>
          <input
            type="number"
            step="0.01"
            value={vatAmount}
            onChange={e => setVatAmount(e.target.value)}
            placeholder="0,00"
            disabled={vatDisabled}
          />
        </label>

        {vatSide && (
          <div className="field ef-span-3" style={{ marginTop: -6 }}>
            <div className="muted" style={{ fontSize: 12 }}>
              ℹ️ Questa IVA verrà conteggiata come <b>{vatSide === 'debit' ? 'IVA a debito' : 'IVA a credito'}</b> nei report.
            </div>
          </div>
        )}

        <label className="field ef-span-3">
          <span className="field-label">Note</span>
          <input
            type="text"
            value={note}
            onChange={e => setNote(e.target.value)}
            placeholder="Facoltativo…"
          />
        </label>
      </div>

      <div className="ef-actions">
        <button className="btn btn-ghost" type="button" onClick={clearAmounts}>
          Svuota importi
        </button>
        <button className="btn btn-primary" type="submit" disabled={!canSubmit}>
          Salva movimento
        </button>
      </div>
    </form>
  );
}
