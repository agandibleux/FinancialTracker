import { useState } from 'react';
import { FileSpreadsheet } from 'lucide-react';
import { toast } from '../lib/toast';
import { btnGhost } from './ui';

export default function ExportExcelButton() {
  const [busy, setBusy] = useState(false);
  const run = async () => {
    setBusy(true);
    try {
      const { exportToExcel } = await import('../lib/excel/exportExcel');
      await exportToExcel();
      toast('Excel file downloaded');
    } catch (e) {
      toast(`Could not export: ${(e as Error).message}`, 'error');
    } finally { setBusy(false); }
  };
  return <button className={btnGhost} disabled={busy} onClick={run}><FileSpreadsheet size={16} />{busy ? 'Preparing…' : 'Export to Excel'}</button>;
}
